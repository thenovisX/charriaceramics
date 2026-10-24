<?php
declare(strict_types=1);

namespace Charria\Services;

use Charria\Database;
use Charria\Env;
use Charria\Http\HttpError;

/**
 * Valida y normaliza las imágenes subidas desde el panel para que la web
 * mantenga su estilo:
 *  - formato: solo JPEG, PNG o WebP (comprobado por contenido, no por extensión);
 *  - peso: máximo UPLOAD_MAX_MB al subir; al guardar se recomprime hasta un peso objetivo;
 *  - proporciones: cada tipo admite solo las proporciones que usa el diseño
 *    (fichas de producto 4:5, galería editorial 16:10, 3:4, 4:5, 1:1, 21:9, 4:3...).
 *    Con fit=crop se recorta al centro a la proporción permitida más cercana;
 *    si no, una imagen con otra proporción se rechaza con un mensaje claro;
 *  - tamaño mínimo para que no se vea pixelada y tamaño máximo de salida;
 *  - se gira según la orientación EXIF del móvil y se eliminan los metadatos
 *    (incluida la ubicación GPS) al recodificar. Recodificar también neutraliza
 *    ficheros maliciosos disfrazados de imagen.
 */
final class ImageProcessor
{
    public const RULES = [
        'product' => ['ratios' => ['4:5'], 'min_width' => 800, 'max_side' => 1600, 'thumb' => 600, 'target_kb' => 350],
        'gallery' => ['ratios' => ['16:10', '3:4', '4:5', '1:1', '21:9', '4:3', '3:2', '2:3'], 'min_width' => 1200, 'max_side' => 2200, 'thumb' => 1000, 'target_kb' => 650],
        'class'   => ['ratios' => ['4:5', '1:1', '4:3', '3:4'], 'min_width' => 600, 'max_side' => 1200, 'thumb' => 700, 'target_kb' => 250],
    ];
    private const TOLERANCE = 0.02;   // 2 % de margen en la proporción
    private const MAX_PIXELS = 36_000_000;
    private const MIMES = ['image/jpeg' => 'jpeg', 'image/png' => 'png', 'image/webp' => 'webp'];

    /** Reglas en formato legible para el panel. */
    public static function rules(): array
    {
        $out = [];
        foreach (self::RULES as $kind => $r) {
            $out[$kind] = [
                'ratios' => $r['ratios'],
                'min_width' => $r['min_width'],
                'max_side' => $r['max_side'],
                'max_upload_mb' => self::maxUploadMb(),
                'formats' => ['jpg', 'png', 'webp'],
            ];
        }
        return $out;
    }

    private static function maxUploadMb(): int
    {
        return max(1, Env::int('UPLOAD_MAX_MB', 10));
    }

    /**
     * Valida, normaliza y guarda una subida ($_FILES['image']). Devuelve la fila insertada en "images".
     */
    public static function store(?array $file, string $kind, string $alt = '', bool $crop = false): array
    {
        if (!isset(self::RULES[$kind])) {
            throw new \InvalidArgumentException("Tipo de imagen desconocido: $kind");
        }
        $rules = self::RULES[$kind];

        if (!$file || !isset($file['error']) || is_array($file['error'])) {
            throw HttpError::validation(['image' => 'Falta la imagen']);
        }
        if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
            throw HttpError::validation(['image' => 'La imagen pesa más de lo que permite el servidor']);
        }
        if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            throw HttpError::validation(['image' => 'No se pudo recibir la imagen']);
        }
        if ($file['size'] > self::maxUploadMb() * 1024 * 1024) {
            throw HttpError::validation(['image' => 'La imagen pesa más de ' . self::maxUploadMb() . ' MB']);
        }

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        if (!isset(self::MIMES[$mime])) {
            throw HttpError::validation(['image' => 'Formato no admitido. Usa JPG, PNG o WebP']);
        }
        $info = @getimagesize($file['tmp_name']);
        if (!$info || $info[0] < 1 || $info[1] < 1) {
            throw HttpError::validation(['image' => 'El archivo no es una imagen válida']);
        }
        if ($info[0] * $info[1] > self::MAX_PIXELS) {
            throw HttpError::validation(['image' => 'La imagen es demasiado grande (máximo 36 megapíxeles)']);
        }

        @ini_set('memory_limit', '512M');
        $img = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($file['tmp_name']),
            'image/png' => @imagecreatefrompng($file['tmp_name']),
            'image/webp' => @imagecreatefromwebp($file['tmp_name']),
        };
        if (!$img) {
            throw HttpError::validation(['image' => 'No se pudo leer la imagen']);
        }
        if ($mime === 'image/jpeg') {
            $img = self::applyExifOrientation($img, $file['tmp_name']);
        }

        $w = imagesx($img);
        $h = imagesy($img);
        $ratio = self::matchRatio($w / $h, $rules['ratios']);
        if ($ratio === null) {
            if (!$crop) {
                imagedestroy($img);
                throw HttpError::validation(['image' => sprintf(
                    'Proporción %s no permitida para %s. Usa %s o activa "recortar automáticamente".',
                    self::describeRatio($w, $h), self::label($kind), implode(', ', $rules['ratios'])
                )]);
            }
            $img = self::cropTo($img, self::nearestRatio($w / $h, $rules['ratios']));
            $w = imagesx($img);
            $h = imagesy($img);
        }
        if ($w < $rules['min_width']) {
            imagedestroy($img);
            throw HttpError::validation(['image' => "La imagen es pequeña: mínimo {$rules['min_width']} px de ancho (tiene $w px)"]);
        }

        $main = self::resize($img, $rules['max_side']);
        $thumb = self::resize($img, $rules['thumb']);
        imagedestroy($img);

        $ext = function_exists('imagewebp') ? 'webp' : 'jpg';
        $dir = sprintf('uploads/%s/%s', $kind, date('Y/m'));
        $absDir = PUBLIC_DIR . '/' . $dir;
        if (!is_dir($absDir) && !mkdir($absDir, 0755, true) && !is_dir($absDir)) {
            throw new \RuntimeException("No se pudo crear la carpeta $dir");
        }
        $name = bin2hex(random_bytes(10));
        $mainPath = "$dir/$name.$ext";
        $thumbPath = "$dir/$name-thumb.$ext";
        $bytes = self::save($main, PUBLIC_DIR . '/' . $mainPath, $ext, $rules['target_kb'] * 1024);
        self::save($thumb, PUBLIC_DIR . '/' . $thumbPath, $ext, (int) ($rules['target_kb'] * 1024 / 3));
        $outW = imagesx($main);
        $outH = imagesy($main);
        imagedestroy($main);
        imagedestroy($thumb);

        $base = Settings::uploadsUrl();
        $row = [
            'kind' => $kind,
            'url' => $base . substr($mainPath, strlen('uploads')),
            'thumb_url' => $base . substr($thumbPath, strlen('uploads')),
            'file_path' => $mainPath,
            'mime' => $ext === 'webp' ? 'image/webp' : 'image/jpeg',
            'width' => $outW,
            'height' => $outH,
            'bytes' => $bytes,
            'alt' => mb_substr($alt, 0, 255),
        ];
        $row['id'] = Database::get()->insert('images', $row);
        return $row;
    }

    /** Borra la fila y los ficheros de una imagen subida (las URL externas de ejemplo solo se borran de la BD). */
    public static function delete(int $imageId): void
    {
        $db = Database::get();
        $img = $db->one('SELECT * FROM images WHERE id = ?', [$imageId]);
        if (!$img) {
            return;
        }
        if ($img['file_path'] && str_starts_with($img['file_path'], 'uploads/') && !str_contains($img['file_path'], '..')) {
            @unlink(PUBLIC_DIR . '/' . $img['file_path']);
            @unlink(PUBLIC_DIR . '/' . preg_replace('/\.(\w+)$/', '-thumb.$1', $img['file_path']));
        }
        $db->exec('DELETE FROM images WHERE id = ?', [$imageId]);
    }

    private static function label(string $kind): string
    {
        return ['product' => 'productos', 'gallery' => 'la galería', 'class' => 'clases'][$kind];
    }

    private static function ratioValue(string $ratio): float
    {
        [$a, $b] = array_map('floatval', explode(':', $ratio));
        return $a / $b;
    }

    private static function matchRatio(float $actual, array $ratios): ?string
    {
        foreach ($ratios as $r) {
            if (abs($actual / self::ratioValue($r) - 1) <= self::TOLERANCE) {
                return $r;
            }
        }
        return null;
    }

    private static function nearestRatio(float $actual, array $ratios): float
    {
        $best = null;
        foreach ($ratios as $r) {
            $v = self::ratioValue($r);
            if ($best === null || abs(log($actual / $v)) < abs(log($actual / $best))) {
                $best = $v;
            }
        }
        return $best;
    }

    private static function describeRatio(int $w, int $h): string
    {
        $g = (static function ($a, $b) { while ($b) { [$a, $b] = [$b, $a % $b]; } return $a; })($w, $h);
        $rw = intdiv($w, $g);
        $rh = intdiv($h, $g);
        return ($rw <= 50 && $rh <= 50) ? "$rw:$rh" : sprintf('%.2f:1', $w / $h);
    }

    private static function cropTo(\GdImage $img, float $ratio): \GdImage
    {
        $w = imagesx($img);
        $h = imagesy($img);
        if ($w / $h > $ratio) {
            $nw = (int) round($h * $ratio);
            $nh = $h;
        } else {
            $nw = $w;
            $nh = (int) round($w / $ratio);
        }
        $out = imagecrop($img, ['x' => intdiv($w - $nw, 2), 'y' => intdiv($h - $nh, 2), 'width' => $nw, 'height' => $nh]);
        imagedestroy($img);
        return $out;
    }

    private static function resize(\GdImage $img, int $maxSide): \GdImage
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $scale = min(1, $maxSide / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));
        $out = imagecreatetruecolor($nw, $nh);
        // Fondo marfil de la web por si la imagen tiene transparencia
        imagefill($out, 0, 0, imagecolorallocate($out, 0xF5, 0xF1, 0xEA));
        imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
        return $out;
    }

    /** Guarda bajando la calidad hasta acercarse al peso objetivo. Devuelve los bytes finales. */
    private static function save(\GdImage $img, string $path, string $ext, int $targetBytes): int
    {
        foreach ([82, 76, 70, 64, 58] as $quality) {
            ob_start();
            $ext === 'webp' ? imagewebp($img, null, $quality) : imagejpeg($img, null, $quality);
            $data = ob_get_clean();
            if (strlen($data) <= $targetBytes) {
                break;
            }
        }
        file_put_contents($path, $data);
        return strlen($data);
    }

    private static function applyExifOrientation(\GdImage $img, string $file): \GdImage
    {
        if (!function_exists('exif_read_data')) {
            return $img;
        }
        $orientation = (int) (@exif_read_data($file)['Orientation'] ?? 1);
        $rotated = match ($orientation) {
            3 => imagerotate($img, 180, 0),
            6 => imagerotate($img, -90, 0),
            8 => imagerotate($img, 90, 0),
            default => null,
        };
        if ($rotated) {
            imagedestroy($img);
            return $rotated;
        }
        return $img;
    }
}
