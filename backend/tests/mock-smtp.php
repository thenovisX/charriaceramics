<?php
/*
 * Servidor SMTP falso para los tests (sin TLS, solo 127.0.0.1):
 *   php backend/tests/mock-smtp.php 2525 &
 * Acepta usuario cualquiera con la contraseña "abcdefghijklmnop" y guarda el
 * último email recibido en <tmp>/charria-mock-smtp.txt.
 */
declare(strict_types=1);

$port = (int) ($argv[1] ?? 2525);
$server = stream_socket_server("tcp://127.0.0.1:$port", $errno, $errstr);
if (!$server) {
    fwrite(STDERR, "No se puede abrir el puerto $port: $errstr\n");
    exit(1);
}
$file = sys_get_temp_dir() . '/charria-mock-smtp.txt';
while ($c = @stream_socket_accept($server, -1)) {
    $say = static fn (string $l) => fwrite($c, $l . "\r\n");
    $say('220 mock ESMTP');
    $log = '';
    $inData = false;
    while (($line = fgets($c)) !== false) {
        if ($inData) {
            if (rtrim($line, "\r\n") === '.') {
                $inData = false;
                file_put_contents($file, $log);
                $say('250 2.0.0 queued');
            } else {
                $log .= $line;
            }
            continue;
        }
        $cmd = strtoupper(substr(trim($line), 0, 4));
        if ($cmd === 'EHLO' || $cmd === 'HELO') {
            $say('250-mock');
            $say('250 AUTH LOGIN');
        } elseif ($cmd === 'AUTH') {
            $say('334 VXNlcm5hbWU6');
            fgets($c);
            $say('334 UGFzc3dvcmQ6');
            $pass = base64_decode(trim((string) fgets($c)));
            $say($pass === 'abcdefghijklmnop' ? '235 2.7.0 Accepted' : '535 5.7.8 Username and Password not accepted');
        } elseif ($cmd === 'MAIL') {
            $log = trim($line) . "\n";
            $say('250 OK');
        } elseif ($cmd === 'RCPT') {
            $log .= trim($line) . "\n";
            $say('250 OK');
        } elseif ($cmd === 'DATA') {
            $say('354 Go ahead');
            $inData = true;
        } elseif ($cmd === 'QUIT') {
            $say('221 Bye');
            break;
        } else {
            $say('250 OK');
        }
    }
    fclose($c);
}
