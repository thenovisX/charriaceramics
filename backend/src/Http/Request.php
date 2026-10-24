<?php
declare(strict_types=1);

namespace Charria\Http;

final class Request
{
    public array $params = [];   // parámetros de la ruta, p. ej. {id}
    public ?array $admin = null; // administrador autenticado (lo rellena Auth)
    private ?array $json = null;

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $headers,
        public readonly string $rawBody,
        public readonly array $post,
        public readonly array $files,
        public readonly string $ip
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
            }
        }
        // Apache en Hostinger pasa la cabecera Authorization como variable de entorno (ver api/.htaccess)
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
        if ($auth) {
            $headers['authorization'] = $auth;
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = $_SERVER['CONTENT_TYPE'];
        }

        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // Todo lo anterior a /api se ignora, así funciona también en una subcarpeta
        $pos = strpos($path, '/api');
        $path = $pos === false ? $path : substr($path, $pos + 4);
        $path = '/' . trim($path, '/');

        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            $path,
            $_GET,
            $headers,
            (string) file_get_contents('php://input'),
            $_POST,
            $_FILES,
            $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'
        );
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /** Cuerpo JSON como array. Si el contenido es multipart, devuelve los campos del formulario. */
    public function body(): array
    {
        if ($this->json !== null) {
            return $this->json;
        }
        $type = $this->header('content-type') ?? '';
        if (str_contains($type, 'multipart/form-data') || str_contains($type, 'application/x-www-form-urlencoded')) {
            return $this->json = $this->post;
        }
        if (trim($this->rawBody) === '') {
            return $this->json = [];
        }
        $data = json_decode($this->rawBody, true);
        if (!is_array($data)) {
            throw new HttpError(400, 'invalid_json', 'El cuerpo de la petición no es JSON válido');
        }
        return $this->json = $data;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body()[$key] ?? $default;
    }

    public function param(string $key): string
    {
        return $this->params[$key] ?? '';
    }

    public function intParam(string $key): int
    {
        $value = $this->param($key);
        if (!ctype_digit($value)) {
            throw HttpError::notFound();
        }
        return (int) $value;
    }
}
