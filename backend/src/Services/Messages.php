<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;

/**
 * Bandeja de Mensajes del panel: lo que llega desde la web para que el estudio
 * conteste (contacto, encargos y solicitudes de clase privada).
 * Se conservan como máximo RETENTION_DAYS (lo dice el aviso del formulario).
 */
final class Messages
{
    public const TYPES = ['contact', 'request', 'private_class'];
    public const RETENTION_DAYS = 365;

    /** Motivos del formulario de contacto que se guardan como petición (encargo). */
    private const REQUEST_REASONS = ['Encargo personalizado'];

    public static function typeForReason(string $reason): string
    {
        return in_array($reason, self::REQUEST_REASONS, true) ? 'request' : 'contact';
    }

    public static function record(string $type, string $subject, array $from, string $body, ?int $bookingId = null): int
    {
        return Database::get()->insert('messages', [
            'type' => $type,
            'subject' => mb_substr($subject, 0, 160),
            'name' => $from['name'],
            'email' => $from['email'],
            'phone' => $from['phone'] ?? '',
            'body' => $body,
            'booking_id' => $bookingId,
        ]);
    }

    public static function unread(): int
    {
        return (int) Database::get()->value('SELECT COUNT(*) FROM messages WHERE read_at IS NULL');
    }

    /** Al confirmar o cancelar la reserva, su solicitud queda atendida. */
    public static function handleBooking(int $bookingId): void
    {
        Database::get()->exec(
            'UPDATE messages SET read_at = COALESCE(read_at, NOW()), handled_at = COALESCE(handled_at, NOW()) WHERE booking_id = ?',
            [$bookingId]
        );
    }

    public static function present(array $m): array
    {
        return [
            'id' => (int) $m['id'],
            'type' => $m['type'],
            'subject' => $m['subject'],
            'name' => $m['name'],
            'email' => $m['email'],
            'phone' => $m['phone'],
            'body' => $m['body'],
            'booking_id' => $m['booking_id'] !== null ? (int) $m['booking_id'] : null,
            'read' => $m['read_at'] !== null,
            'handled' => $m['handled_at'] !== null,
            'handled_at' => $m['handled_at'],
            'created_at' => $m['created_at'],
        ];
    }
}
