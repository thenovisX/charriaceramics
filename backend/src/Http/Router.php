<?php
declare(strict_types=1);

namespace Charria\Http;

/** Enrutador mínimo: "GET /products/{id}" => [Controlador::class, 'método'] con middlewares opcionales. */
final class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, callable|array $handler, array $middleware = []): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', rtrim($pattern, '/') ?: '/') . '$#';
        $this->routes[] = compact('method', 'pattern', 'regex', 'handler', 'middleware');
    }

    public function get(string $p, callable|array $h, array $m = []): void { $this->add('GET', $p, $h, $m); }
    public function post(string $p, callable|array $h, array $m = []): void { $this->add('POST', $p, $h, $m); }
    public function put(string $p, callable|array $h, array $m = []): void { $this->add('PUT', $p, $h, $m); }
    public function patch(string $p, callable|array $h, array $m = []): void { $this->add('PATCH', $p, $h, $m); }
    public function delete(string $p, callable|array $h, array $m = []): void { $this->add('DELETE', $p, $h, $m); }

    public function dispatch(Request $request): Response
    {
        $allowed = [];
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $m)) {
                continue;
            }
            if ($route['method'] !== $request->method) {
                $allowed[] = $route['method'];
                continue;
            }
            $request->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            foreach ($route['middleware'] as $middleware) {
                $middleware($request);
            }
            $handler = $route['handler'];
            if (is_array($handler) && is_string($handler[0])) {
                $handler = [new $handler[0](), $handler[1]];
            }
            return $handler($request);
        }
        if ($allowed) {
            header('Allow: ' . implode(', ', array_unique($allowed)));
            throw new HttpError(405, 'method_not_allowed', 'Método no permitido');
        }
        throw HttpError::notFound('Ruta no encontrada');
    }

    public function routes(): array
    {
        return array_map(static fn ($r) => $r['method'] . ' ' . $r['pattern'], $this->routes);
    }
}
