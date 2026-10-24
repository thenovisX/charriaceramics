<?php
declare(strict_types=1);

namespace Charria\Http;

/** Error con código HTTP que la API devuelve como JSON: { "error": { code, message, fields } } */
final class HttpError extends \RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $fields = []
    ) {
        parent::__construct($message, $status);
    }

    public static function validation(array $fields, string $message = 'Revisa los datos enviados'): self
    {
        return new self(422, 'validation_error', $message, $fields);
    }

    public static function notFound(string $message = 'No encontrado'): self
    {
        return new self(404, 'not_found', $message);
    }
}
