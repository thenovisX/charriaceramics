<?php
declare(strict_types=1);

namespace Charria\Http;

final class Response
{
    public function __construct(
        public readonly mixed $data,
        public readonly int $status = 200
    ) {
    }

    public static function json(mixed $data, int $status = 200): self
    {
        return new self($data, $status);
    }

    public static function created(mixed $data): self
    {
        return new self($data, 201);
    }

    public static function noContent(): self
    {
        return new self(null, 204);
    }

    public function send(): void
    {
        http_response_code($this->status);
        if ($this->status === 204) {
            return;
        }
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['data' => $this->data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function error(HttpError $e): void
    {
        http_response_code($e->status);
        header('Content-Type: application/json; charset=utf-8');
        $error = ['code' => $e->errorCode, 'message' => $e->getMessage()];
        if ($e->fields) {
            $error['fields'] = $e->fields;
        }
        echo json_encode(['error' => $error], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
