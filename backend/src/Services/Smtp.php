<?php
declare(strict_types=1);

namespace Charria\Services;

/**
 * Cliente SMTP mínimo (sin Composer) para enviar los emails con una cuenta de
 * Gmail / Google Workspace o con un buzón del hosting. Puerto 465 = SSL directo;
 * cualquier otro puerto = STARTTLS obligatorio antes de mandar la contraseña.
 * Los fallos se lanzan como \RuntimeException con un mensaje en español sencillo.
 */
final class Smtp
{
    private const TIMEOUT = 15;

    /** @var resource|null */
    private $socket = null;

    public function __construct(
        private string $host,
        private int $port,
        private string $user,
        private string $pass,
    ) {
    }

    public function send(string $from, string $fromName, string $to, ?string $replyTo, string $subject, string $text): void
    {
        try {
            $this->connect();
            $this->command('MAIL FROM:<' . $from . '>', [250], 'mail');
            $this->command('RCPT TO:<' . $to . '>', [250, 251], 'rcpt');
            $this->command('DATA', [354], 'data');
            $this->command(self::message($from, $fromName, $to, $replyTo, $subject, $text) . "\r\n.", [250], 'data');
            $this->command('QUIT', [221], 'quit', false);
        } finally {
            if ($this->socket) {
                fclose($this->socket);
                $this->socket = null;
            }
        }
    }

    private function connect(): void
    {
        $ssl = $this->port === 465;
        $context = stream_context_create(['ssl' => ['peer_name' => $this->host, 'verify_peer' => true, 'verify_peer_name' => true]]);
        $socket = @stream_socket_client(($ssl ? 'ssl://' : 'tcp://') . $this->host . ':' . $this->port, $errno, $errstr, self::TIMEOUT, STREAM_CLIENT_CONNECT, $context);
        if (!$socket) {
            throw new \RuntimeException("No se ha podido conectar con {$this->host} (puerto {$this->port}). Revisa el servidor y el puerto; si son correctos, puede que el hosting bloquee esa salida." . ($errstr ? " Detalle: $errstr" : ''));
        }
        stream_set_timeout($socket, self::TIMEOUT);
        $this->socket = $socket;
        $this->expect([220], 'greeting');
        $features = $this->command('EHLO ' . self::localName(), [250], 'ehlo');

        if (!$ssl) {
            $local = in_array($this->host, ['127.0.0.1', 'localhost'], true);
            if (stripos($features, 'STARTTLS') !== false) {
                $this->command('STARTTLS', [220], 'tls');
                if (!@stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                    throw new \RuntimeException("No se ha podido cifrar la conexión con {$this->host}. Prueba con el puerto 465.");
                }
                $features = $this->command('EHLO ' . self::localName(), [250], 'ehlo');
            } elseif (!$local) {
                // Nunca mandamos la contraseña sin cifrar (solo se permite en pruebas locales)
                throw new \RuntimeException("{$this->host} no ofrece conexión cifrada en el puerto {$this->port}. Usa el puerto 465 o 587.");
            }
        }

        if ($this->user !== '') {
            $this->command('AUTH LOGIN', [334], 'auth');
            $this->command(base64_encode($this->user), [334], 'auth');
            $this->command(base64_encode($this->pass), [235], 'auth');
        }
    }

    /** Manda una línea y espera uno de los códigos indicados. Devuelve la respuesta entera. */
    private function command(string $line, array $codes, string $step, bool $strict = true): string
    {
        if (@fwrite($this->socket, $line . "\r\n") === false) {
            throw new \RuntimeException("Se ha cortado la conexión con {$this->host}.");
        }
        return $this->expect($codes, $step, $strict);
    }

    private function expect(array $codes, string $step, bool $strict = true): string
    {
        $reply = '';
        while (($l = fgets($this->socket, 1024)) !== false) {
            $reply .= $l;
            if (strlen($l) < 4 || $l[3] !== '-') {
                break;
            }
        }
        $code = (int) substr($reply, 0, 3);
        if ($strict && !in_array($code, $codes, true)) {
            throw new \RuntimeException(self::explain($step, $code, trim($reply)));
        }
        return $reply;
    }

    /** Traduce el error del servidor a algo que se entienda. */
    private static function explain(string $step, int $code, string $reply): string
    {
        $detail = $reply === '' ? 'el servidor no ha respondido a tiempo' : mb_substr(preg_replace('/\s+/', ' ', $reply), 0, 200);
        if ($step === 'auth' && in_array($code, [534, 535], true)) {
            return 'El servidor no acepta el usuario o la contraseña. Con Gmail tiene que ser una «contraseña de aplicación» de 16 letras (no la contraseña normal de la cuenta), creada en la misma cuenta que pones como remitente. (' . $detail . ')';
        }
        if ($step === 'auth') {
            return 'El servidor no deja iniciar sesión. (' . $detail . ')';
        }
        if ($step === 'mail') {
            return 'El servidor no deja enviar con ese remitente. Con Gmail el remitente tiene que ser la misma cuenta de Gmail. (' . $detail . ')';
        }
        if ($step === 'rcpt') {
            return 'El servidor ha rechazado la dirección de destino. Revisa el email. (' . $detail . ')';
        }
        return 'El servidor de correo ha dado un error. (' . $detail . ')';
    }

    private static function message(string $from, string $fromName, string $to, ?string $replyTo, string $subject, string $text): string
    {
        $domain = substr(strrchr($from, '@') ?: '@localhost', 1);
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . self::encode($fromName) . ' <' . $from . '>',
            'To: <' . $to . '>',
            'Subject: ' . self::encode($subject),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ];
        if ($replyTo && $replyTo !== $from) {
            array_splice($headers, 3, 0, 'Reply-To: <' . $replyTo . '>');
        }
        $body = rtrim(chunk_split(base64_encode(str_replace(["\r\n", "\r", "\n"], ["\n", "\n", "\r\n"], $text)), 76, "\r\n"));
        return implode("\r\n", $headers) . "\r\n\r\n" . $body;
    }

    private static function encode(string $value): string
    {
        $value = str_replace(["\r", "\n"], ' ', $value);
        return preg_match('/^[\x20-\x7E]*$/', $value) && !preg_match('/[<>"]/', $value) ? $value : '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    private static function localName(): string
    {
        $host = $_SERVER['SERVER_NAME'] ?? gethostname() ?: 'localhost';
        return preg_match('/^[A-Za-z0-9.-]+$/', $host) ? $host : 'localhost';
    }
}
