<?php
declare(strict_types=1);

namespace Charria;

use Charria\Http\HttpError;

/**
 * Valida y normaliza la entrada. Cada método devuelve el valor limpio
 * (o null si el campo no viene y no es obligatorio) y acumula los errores;
 * check() lanza un 422 con todos los errores a la vez.
 */
final class Validator
{
    private array $errors = [];

    public function __construct(private array $data)
    {
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->data);
    }

    private function raw(string $key, bool $required): mixed
    {
        $value = $this->data[$key] ?? null;
        if (is_string($value)) {
            $value = trim($value);
        }
        if ($value === null || $value === '') {
            if ($required) {
                $this->errors[$key] = 'Obligatorio';
            }
            return null;
        }
        return $value;
    }

    public function string(string $key, bool $required = false, int $max = 255, int $min = 0): ?string
    {
        $value = $this->raw($key, $required);
        if ($value === null) {
            if (!$required && $min > 0 && $this->has($key)) {
                $this->errors[$key] = 'No puede quedar vacío';
            }
            return $required ? null : ($this->has($key) ? '' : null);
        }
        if (!is_scalar($value)) {
            $this->errors[$key] = 'Debe ser texto';
            return null;
        }
        $value = (string) $value;
        $len = mb_strlen($value);
        if ($len > $max) {
            $this->errors[$key] = "Máximo $max caracteres";
        } elseif ($len < $min) {
            $this->errors[$key] = "Mínimo $min caracteres";
        }
        return $value;
    }

    public function email(string $key, bool $required = false): ?string
    {
        $value = $this->string($key, $required, 190);
        if ($value !== null && $value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            $this->errors[$key] = 'Email no válido';
        }
        return $value === null ? null : mb_strtolower($value);
    }

    public function int(string $key, bool $required = false, int $min = PHP_INT_MIN, int $max = PHP_INT_MAX): ?int
    {
        $value = $this->raw($key, $required);
        if ($value === null) {
            return null;
        }
        if (filter_var($value, FILTER_VALIDATE_INT) === false) {
            $this->errors[$key] = 'Debe ser un número entero';
            return null;
        }
        $value = (int) $value;
        if ($value < $min || $value > $max) {
            $this->errors[$key] = "Debe estar entre $min y $max";
        }
        return $value;
    }

    public function bool(string $key, bool $required = false): ?bool
    {
        $value = $this->raw($key, $required);
        if ($value === null) {
            return null;
        }
        $bool = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($bool === null) {
            $this->errors[$key] = 'Debe ser verdadero o falso';
        }
        return $bool;
    }

    public function enum(string $key, array $allowed, bool $required = false): ?string
    {
        $value = $this->string($key, $required, 60);
        if ($value !== null && $value !== '' && !in_array($value, $allowed, true)) {
            $this->errors[$key] = 'Valor no permitido: ' . implode(', ', $allowed);
        }
        return $value;
    }

    /** Fecha YYYY-MM-DD */
    public function date(string $key, bool $required = false): ?string
    {
        $value = $this->string($key, $required, 10);
        if ($value) {
            $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            if (!$d || $d->format('Y-m-d') !== $value) {
                $this->errors[$key] = 'Fecha no válida (AAAA-MM-DD)';
            }
        }
        return $value ?: null;
    }

    /** Fecha y hora "YYYY-MM-DD HH:MM" o "YYYY-MM-DDTHH:MM", devuelta como "YYYY-MM-DD HH:MM:00" */
    public function datetime(string $key, bool $required = false): ?string
    {
        $value = $this->string($key, $required, 25);
        if (!$value) {
            return null;
        }
        $value = str_replace('T', ' ', $value);
        foreach (['Y-m-d H:i:s', 'Y-m-d H:i'] as $format) {
            $d = \DateTimeImmutable::createFromFormat($format, $value);
            if ($d) {
                return $d->format('Y-m-d H:i:00');
            }
        }
        $this->errors[$key] = 'Fecha y hora no válidas (AAAA-MM-DD HH:MM)';
        return null;
    }

    public function array(string $key, bool $required = false): ?array
    {
        $value = $this->data[$key] ?? null;
        if ($value === null) {
            if ($required) {
                $this->errors[$key] = 'Obligatorio';
            }
            return null;
        }
        if (!is_array($value)) {
            $this->errors[$key] = 'Debe ser una lista u objeto';
            return null;
        }
        return $value;
    }

    public function addError(string $key, string $message): void
    {
        $this->errors[$key] = $message;
    }

    /** Valida un objeto anidado (p. ej. "customer") y agrupa sus errores como "customer.email". */
    public function nested(string $key, callable $fn, bool $required = true): mixed
    {
        $value = $this->array($key, $required) ?? [];
        $inner = new Validator($value);
        $result = $fn($inner);
        foreach ($inner->errors() as $field => $message) {
            $this->errors["$key.$field"] = $message;
        }
        return $result;
    }

    public function errors(): array
    {
        return $this->errors;
    }

    public function check(): void
    {
        if ($this->errors) {
            throw HttpError::validation($this->errors);
        }
    }

    /** Convierte un título en slug para URLs: "Jarrón Duna" -> "jarron-duna" */
    public static function slugify(string $text): string
    {
        $text = mb_strtolower($text);
        $text = strtr($text, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', 'ç' => 'c', 'à' => 'a', 'è' => 'e', 'ò' => 'o']);
        $text = preg_replace('/[^a-z0-9]+/', '-', $text);
        return trim($text, '-') ?: 'item';
    }
}
