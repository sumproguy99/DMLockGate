<?php

use App\Exceptions\ApiException;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Middleware\RequireRecentConfirmation;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * @param  array<string, mixed>  $extra
 */
$apiError = fn (int $status, string $code, string $message, array $extra = []): JsonResponse => response()->json([
    'error' => ['code' => $code, 'message' => $message, ...$extra],
], $status);

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->alias([
            'active' => EnsureAccountIsActive::class,
            'step-up' => RequireRecentConfirmation::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) use ($apiError): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->dontReport(ApiException::class);

        $exceptions->render(function (Throwable $e, Request $request) use ($apiError): ?JsonResponse {
            if (! $request->is('api/*')) {
                return null;
            }

            return match (true) {
                $e instanceof ApiException => $apiError($e->status, $e->errorCode, $e->getMessage(), $e->details === [] ? [] : ['details' => $e->details]),
                $e instanceof ValidationException => $apiError(422, 'validation_failed', 'Some fields need attention.', ['fields' => $e->errors()]),
                $e instanceof AuthenticationException => $apiError(401, 'unauthenticated', 'Sign in to continue.'),
                $e instanceof TokenMismatchException => $apiError(419, 'csrf_token_mismatch', 'Your session expired. Reload the page and try again.'),
                $e instanceof AuthorizationException, $e instanceof AccessDeniedHttpException => $apiError(403, 'forbidden', 'You do not have permission to do this.'),
                $e instanceof ThrottleRequestsException => $apiError(429, 'too_many_requests', 'Too many attempts. Wait a moment and try again.'),
                $e instanceof NotFoundHttpException => $apiError(404, 'not_found', 'The requested item was not found.'),
                $e instanceof HttpExceptionInterface => $apiError($e->getStatusCode(), 'http_error', $e->getMessage() ?: 'The request could not be completed.'),
                config('app.debug') => null,
                default => $apiError(500, 'server_error', 'Something went wrong on the server. The error has been logged.'),
            };
        });
    })->create();
