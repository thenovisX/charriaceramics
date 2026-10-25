<?php
declare(strict_types=1);

use Charria\Controllers\Admin\ClassAdminController as Classes;
use Charria\Controllers\Admin\CustomerAdminController as Customers;
use Charria\Controllers\Admin\GalleryAdminController as Gallery;
use Charria\Controllers\Admin\MessageAdminController as Messages;
use Charria\Controllers\Admin\OrderAdminController as Orders;
use Charria\Controllers\Admin\ProductAdminController as Products;
use Charria\Controllers\Admin\SettingsController;
use Charria\Controllers\AuthController;
use Charria\Controllers\BookingController;
use Charria\Controllers\CheckoutController;
use Charria\Controllers\PrivacyController;
use Charria\Controllers\PublicController;
use Charria\Controllers\WebhookController;
use Charria\Http\Router;
use Charria\Services\Auth;

/** Todas las rutas de la API. Las de /admin pasan por Auth::requireAdmin en cada petición. */
return static function (Router $r): void {
    // ---------- Público ----------
    $r->get('/health', [PublicController::class, 'health']);
    $r->get('/site', [PublicController::class, 'site']);
    $r->get('/products', [PublicController::class, 'products']);
    $r->get('/products/{id}', [PublicController::class, 'product']);
    $r->get('/gallery', [PublicController::class, 'gallery']);
    $r->get('/classes', [PublicController::class, 'classes']);
    $r->post('/cart/quote', [PublicController::class, 'cartQuote']);
    $r->post('/shipping/quote', [CheckoutController::class, 'shippingQuote']);
    $r->post('/checkout', [CheckoutController::class, 'checkout']);
    $r->get('/checkout/status', [CheckoutController::class, 'status']);
    $r->post('/bookings', [BookingController::class, 'createGroup']);
    $r->post('/bookings/private', [BookingController::class, 'createPrivate']);
    $r->post('/contact', [PublicController::class, 'contact']);
    $r->post('/privacy/request', [PrivacyController::class, 'request']);
    $r->post('/privacy/confirm', [PrivacyController::class, 'confirm']);
    $r->post('/privacy/unsubscribe', [PrivacyController::class, 'unsubscribeLink']);
    $r->post('/webhooks/stripe', [WebhookController::class, 'stripe']);

    // ---------- Instalación y sesión ----------
    $r->get('/setup', [AuthController::class, 'setupStatus']);
    $r->post('/setup', [AuthController::class, 'setup']);
    $r->post('/auth/login', [AuthController::class, 'login']);

    // ---------- Panel (requiere token) ----------
    $admin = [[Auth::class, 'requireAdmin']];
    $r->post('/auth/logout', [AuthController::class, 'logout'], $admin);
    $r->get('/auth/me', [AuthController::class, 'me'], $admin);
    $r->put('/admin/password', [AuthController::class, 'changePassword'], $admin);

    $r->get('/admin/stats', [Orders::class, 'stats'], $admin);

    $r->get('/admin/products', [Products::class, 'index'], $admin);
    $r->post('/admin/products', [Products::class, 'store'], $admin);
    $r->get('/admin/products/{id}', [Products::class, 'show'], $admin);
    $r->put('/admin/products/{id}', [Products::class, 'update'], $admin);
    $r->patch('/admin/products/{id}', [Products::class, 'update'], $admin);
    $r->delete('/admin/products/{id}', [Products::class, 'destroy'], $admin);
    $r->patch('/admin/products/{id}/sold-out', [Products::class, 'soldOut'], $admin);
    $r->post('/admin/products/{id}/images', [Products::class, 'uploadImage'], $admin);
    $r->put('/admin/products/{id}/images', [Products::class, 'reorderImages'], $admin);
    $r->delete('/admin/products/{id}/images/{imageId}', [Products::class, 'deleteImage'], $admin);

    $r->get('/admin/classes', [Classes::class, 'index'], $admin);
    $r->post('/admin/classes', [Classes::class, 'store'], $admin);
    $r->put('/admin/classes/{id}', [Classes::class, 'update'], $admin);
    $r->patch('/admin/classes/{id}', [Classes::class, 'update'], $admin);
    $r->delete('/admin/classes/{id}', [Classes::class, 'destroy'], $admin);
    $r->post('/admin/classes/{id}/image', [Classes::class, 'uploadImage'], $admin);
    $r->post('/admin/sessions', [Classes::class, 'storeSession'], $admin);
    $r->put('/admin/sessions/{id}', [Classes::class, 'updateSession'], $admin);
    $r->patch('/admin/sessions/{id}', [Classes::class, 'updateSession'], $admin);
    $r->delete('/admin/sessions/{id}', [Classes::class, 'destroySession'], $admin);
    $r->get('/admin/bookings', [Classes::class, 'bookings'], $admin);
    $r->patch('/admin/bookings/{id}', [Classes::class, 'updateBooking'], $admin);

    $r->get('/admin/gallery', [Gallery::class, 'index'], $admin);
    $r->post('/admin/gallery', [Gallery::class, 'store'], $admin);
    $r->put('/admin/gallery/order', [Gallery::class, 'reorder'], $admin);
    $r->put('/admin/gallery/{id}', [Gallery::class, 'update'], $admin);
    $r->patch('/admin/gallery/{id}', [Gallery::class, 'update'], $admin);
    $r->delete('/admin/gallery/{id}', [Gallery::class, 'destroy'], $admin);
    $r->get('/admin/image-rules', [Gallery::class, 'rules'], $admin);

    $r->get('/admin/orders', [Orders::class, 'index'], $admin);
    $r->get('/admin/orders/{id}', [Orders::class, 'show'], $admin);
    $r->patch('/admin/orders/{id}', [Orders::class, 'update'], $admin);
    $r->post('/admin/orders/{id}/packlink', [Orders::class, 'packlink'], $admin);

    $r->get('/admin/customers', [Customers::class, 'index'], $admin);
    $r->post('/admin/customers/erase', [Customers::class, 'eraseByEmail'], $admin);
    $r->post('/admin/customers/purge-legacy', [Customers::class, 'purgeLegacy'], $admin);
    $r->get('/admin/customers/{id}', [Customers::class, 'show'], $admin);
    $r->patch('/admin/customers/{id}', [Customers::class, 'update'], $admin);
    $r->delete('/admin/customers/{id}', [Customers::class, 'destroy'], $admin);
    $r->get('/admin/customers/{id}/export', [Customers::class, 'export'], $admin);
    $r->get('/admin/marketing', [Customers::class, 'marketing'], $admin);
    $r->get('/admin/privacy-requests', [Customers::class, 'requests'], $admin);

    $r->get('/admin/messages', [Messages::class, 'index'], $admin);
    $r->get('/admin/messages/unread', [Messages::class, 'unread'], $admin);
    $r->get('/admin/messages/{id}', [Messages::class, 'show'], $admin);
    $r->patch('/admin/messages/{id}', [Messages::class, 'update'], $admin);
    $r->delete('/admin/messages/{id}', [Messages::class, 'destroy'], $admin);

    $r->get('/admin/settings', [SettingsController::class, 'show'], $admin);
    $r->put('/admin/settings', [SettingsController::class, 'update'], $admin);
    $r->post('/admin/settings/test', [SettingsController::class, 'test'], $admin);
};
