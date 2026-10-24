<?php
declare(strict_types=1);

namespace Charria;

use PDO;

/** Envoltorio fino sobre PDO: siempre consultas preparadas, nunca SQL concatenado con datos del usuario. */
final class Database
{
    private static ?Database $instance = null;

    private function __construct(private PDO $pdo)
    {
    }

    public static function get(): Database
    {
        if (self::$instance === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                Env::get('DB_HOST', 'localhost'),
                Env::int('DB_PORT', 3306),
                Env::required('DB_NAME')
            );
            $pdo = new PDO($dsn, Env::required('DB_USER'), Env::get('DB_PASS', ''), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
            // NOW() de MySQL en la misma hora que PHP (Hostinger no siempre tiene zonas con nombre)
            $pdo->exec("SET time_zone = '" . date('P') . "'");
            self::$instance = new Database($pdo);
        }
        return self::$instance;
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    public function all(string $sql, array $params = []): array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function one(string $sql, array $params = []): ?array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function value(string $sql, array $params = []): mixed
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $value = $stmt->fetchColumn();
        return $value === false ? null : $value;
    }

    public function exec(string $sql, array $params = []): int
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    /** Inserta una fila. Las claves de $data son nombres de columna fijados en el código, nunca del usuario. */
    public function insert(string $table, array $data): int
    {
        $cols = array_keys($data);
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(', ', $cols),
            implode(', ', array_map(static fn ($c) => ':' . $c, $cols))
        );
        $this->exec($sql, $data);
        return (int) $this->pdo->lastInsertId();
    }

    public function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        if (!$data) {
            return 0;
        }
        $set = implode(', ', array_map(static fn ($c) => "$c = :set_$c", array_keys($data)));
        $params = [];
        foreach ($data as $col => $value) {
            $params["set_$col"] = $value;
        }
        return $this->exec("UPDATE $table SET $set WHERE $where", $params + $whereParams);
    }

    /** Ejecuta $fn dentro de una transacción; si lanza una excepción se deshace todo. */
    public function transaction(callable $fn): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $result = $fn($this);
            $this->pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** Ejecuta un fichero .sql (schema.sql, seed.sql) sentencia a sentencia. */
    public function runSqlFile(string $file): void
    {
        $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
        foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $statement) {
            $this->pdo->exec($statement);
        }
    }
}
