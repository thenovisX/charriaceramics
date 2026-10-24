<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Env;

/**
 * Emails de aviso con mail() de PHP (Hostinger lo permite con un remitente del
 * propio dominio). Si falla no rompe la compra: solo queda en el log.
 */
final class Mailer
{
    public static function send(string $to, string $subject, string $text): void
    {
        $from = Env::get('MAIL_FROM');
        if (!$from || !filter_var($to, FILTER_VALIDATE_EMAIL) || Env::bool('MAIL_DISABLED')) {
            return;
        }
        $headers = [
            'From: Charria Ceramics <' . $from . '>',
            'Reply-To: ' . Env::get('MAIL_ADMIN', $from),
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
        ];
        $subject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        if (!@mail($to, $subject, $text, implode("\r\n", $headers))) {
            Log::error('mail() failed', ['to' => $to]);
        }
    }

    public static function admin(string $subject, string $text): void
    {
        $admin = Env::get('MAIL_ADMIN');
        if ($admin) {
            self::send($admin, $subject, $text);
        }
    }

    public static function money(int $cents): string
    {
        return number_format($cents / 100, 2, ',', '.') . ' €';
    }
}
