<?php

namespace Tests\Feature\Http;

use App\Actions\Auth\CompleteLogin;
use App\Enums\AccessChannel;
use App\Enums\AccessRequestStatus;
use App\Enums\AuditOutcome;
use App\Enums\LockAction;
use App\Enums\RoleTemplate;
use App\Models\AccessRequest;
use App\Models\AuditLog;
use App\Models\Invitation;
use App\Models\LocationRequest;
use App\Models\Lock;
use App\Models\Property;
use App\Models\Role;
use App\Models\SecurityAlert;
use App\Models\SecurityIncident;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Audit\AuditLogger;
use Database\Seeders\PermissionCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as Router;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Every API route against every role template: which roles get past authorization and which are
 * refused with 403. Each role holds only its template's permissions and access to the lock under
 * test, and has recently confirmed its identity, so the result is the permission decision alone.
 * A new route fails this test until it is added to ACCESS with a deliberate answer.
 */
class RouteAccessMatrixTest extends TestCase
{
    use RefreshDatabase;

    private const ALL = ['super_administrator', 'security_administrator', 'property_manager', 'resident', 'temporary_guest', 'service_provider', 'read_only_auditor'];

    private const USER_ADMINS = ['super_administrator', 'security_administrator', 'property_manager'];

    private const HISTORY = ['super_administrator', 'security_administrator', 'property_manager', 'resident', 'read_only_auditor'];

    private const AUDIT = ['super_administrator', 'security_administrator', 'read_only_auditor'];

    private const INCIDENT_HANDLERS = ['super_administrator', 'security_administrator'];

    private const DEVICE_VIEWERS = ['super_administrator', 'security_administrator', 'property_manager'];

    /**
     * Route name => the roles allowed past authorization. Routes about the caller's own account are
     * open to everyone signed in.
     */
    private const ACCESS = [
        'api.v1.auth.logout' => self::ALL,
        'api.v1.auth.me' => self::ALL,
        'api.v1.auth.confirm' => self::ALL,
        'api.v1.auth.sessions.index' => self::ALL,
        'api.v1.auth.sessions.destroy-others' => self::ALL,
        'api.v1.auth.devices.index' => self::ALL,
        'api.v1.auth.devices.trust-current' => self::ALL,
        'api.v1.auth.devices.update' => self::ALL,
        'api.v1.auth.devices.revoke' => self::ALL,
        'api.v1.auth.mfa.store' => self::ALL,
        'api.v1.auth.mfa.confirm' => self::ALL,
        'api.v1.auth.mfa.destroy' => self::ALL,
        'api.v1.dashboard' => self::ALL,
        'api.v1.system.health' => self::ALL,
        'api.v1.audit-logs.index' => self::AUDIT,
        'api.v1.audit-logs.export' => self::AUDIT,
        'api.v1.audit-logs.show' => self::AUDIT,
        'api.v1.users.index' => self::USER_ADMINS,
        'api.v1.users.show' => self::USER_ADMINS,
        'api.v1.users.security-history' => self::USER_ADMINS,
        'api.v1.roles.index' => self::USER_ADMINS,
        'api.v1.permissions.index' => self::USER_ADMINS,
        'api.v1.permission-preview' => ['super_administrator', 'property_manager'],
        'api.v1.users.store' => ['super_administrator', 'property_manager'],
        'api.v1.users.update' => ['super_administrator', 'property_manager'],
        'api.v1.users.suspend' => self::USER_ADMINS,
        'api.v1.users.reactivate' => self::USER_ADMINS,
        'api.v1.users.revoke' => ['super_administrator', 'security_administrator'],
        'api.v1.users.sessions.revoke' => ['super_administrator', 'security_administrator'],
        // Other people's devices: devices.view, devices.rename, devices.revoke and devices.enroll.
        'api.v1.devices.index' => self::DEVICE_VIEWERS,
        'api.v1.users.devices.index' => self::DEVICE_VIEWERS,
        'api.v1.devices.update' => ['super_administrator'],
        'api.v1.devices.revoke' => ['super_administrator', 'security_administrator'],
        'api.v1.devices.trust' => ['super_administrator'],
        'api.v1.users.device-codes.store' => ['super_administrator'],
        // Invitations: users.create, like creating an account directly.
        'api.v1.invitations.index' => ['super_administrator', 'property_manager'],
        'api.v1.invitations.store' => ['super_administrator', 'property_manager'],
        'api.v1.invitations.resend' => ['super_administrator', 'property_manager'],
        'api.v1.invitations.cancel' => ['super_administrator', 'property_manager'],
        // Email settings: admin.notifications.
        'api.v1.settings.email.show' => self::INCIDENT_HANDLERS,
        'api.v1.settings.email.update' => self::INCIDENT_HANDLERS,
        'api.v1.settings.email.test' => self::INCIDENT_HANDLERS,
        'api.v1.settings.notifications.show' => self::INCIDENT_HANDLERS,
        'api.v1.settings.notifications.update' => self::INCIDENT_HANDLERS,
        // Security policy: admin.security_policies.
        'api.v1.settings.security.show' => self::INCIDENT_HANDLERS,
        'api.v1.settings.security.update' => self::INCIDENT_HANDLERS,
        'api.v1.users.roles.update' => ['super_administrator'],
        'api.v1.users.permissions.update' => ['super_administrator'],
        'api.v1.locks.index' => self::ALL,
        'api.v1.locks.show' => self::ALL,
        'api.v1.locks.history' => self::HISTORY,
        'api.v1.activity' => self::HISTORY,
        'api.v1.locks.commands.store' => ['super_administrator', 'security_administrator', 'property_manager', 'resident', 'temporary_guest', 'service_provider'],
        'api.v1.lock-requests.show' => self::ALL,
        'api.v1.properties.index' => ['super_administrator'],
        'api.v1.properties.store' => ['super_administrator'],
        'api.v1.locks.store' => ['super_administrator'],
        'api.v1.locks.update' => ['super_administrator'],
        'api.v1.locks.access.update' => ['super_administrator', 'property_manager'],
        'api.v1.locks.access.destroy' => self::USER_ADMINS,
        // A person's own location: attached to their own lock request, or answering a request addressed to them.
        'api.v1.lock-requests.location.store' => self::ALL,
        'api.v1.location.mine' => self::ALL,
        'api.v1.location.requests.pending' => self::ALL,
        'api.v1.location.requests.respond' => self::ALL,
        // Other people's locations: location.view_history only.
        'api.v1.location.map' => ['super_administrator'],
        'api.v1.location.requests.show' => ['super_administrator'],
        'api.v1.location.requests.store' => ['super_administrator'],
        // Each person's own notifications.
        'api.v1.notifications.index' => self::ALL,
        'api.v1.notifications.summary' => self::ALL,
        'api.v1.notifications.read-all' => self::ALL,
        'api.v1.notifications.read' => self::ALL,
        'api.v1.notifications.preferences.show' => self::ALL,
        'api.v1.notifications.preferences.update' => self::ALL,
        // Security Center: auditors see alerts and incidents; only incident handlers act on them.
        'api.v1.security.alerts.index' => self::AUDIT,
        'api.v1.security.alerts.show' => self::AUDIT,
        'api.v1.security.alerts.acknowledge' => self::INCIDENT_HANDLERS,
        'api.v1.security.alerts.resolve' => self::INCIDENT_HANDLERS,
        'api.v1.security.incidents.index' => self::AUDIT,
        'api.v1.security.incidents.show' => self::AUDIT,
        'api.v1.security.incidents.store' => self::INCIDENT_HANDLERS,
        'api.v1.security.incidents.status' => self::INCIDENT_HANDLERS,
    ];

    /**
     * Routes whose body is checked before the permission, and why that reveals nothing.
     */
    private const VALIDATES_FIRST = [
        // The decision needs the action; the only errors are its format, and every refusal is recorded.
        'api.v1.locks.commands.store' => 'action and idempotency key format only',
    ];

    /** Signed-out routes, checked elsewhere. */
    private const PUBLIC = [
        'api.v1.auth.login',
        'api.v1.auth.mfa.verify',
        'api.v1.auth.password.forgot',
        'api.v1.auth.password.reset',
        'api.v1.invitations.accept.show',
        'api.v1.invitations.accept.account',
        'api.v1.invitations.accept.lesson',
        'api.v1.invitations.accept.quiz',
        'api.v1.invitations.accept.quiz.answer',
        'api.v1.invitations.accept.device',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionCatalogSeeder::class);
        $this->withHeader('Origin', 'http://localhost');
    }

    public function test_every_api_route_is_in_the_matrix(): void
    {
        $names = collect(Router::getRoutes()->getRoutes())
            ->map(fn (Route $route): ?string => $route->getName())
            ->filter(fn (?string $name): bool => $name !== null && str_starts_with($name, 'api.v1.') && ! in_array($name, self::PUBLIC, true))
            ->values();

        $this->assertSame([], $names->diff(array_keys(self::ACCESS))->values()->all(), 'Add these routes to RouteAccessMatrixTest::ACCESS.');
        $this->assertSame([], collect(array_keys(self::ACCESS))->diff($names)->values()->all(), 'These routes no longer exist.');
    }

    public function test_each_role_is_allowed_or_refused_as_the_matrix_says(): void
    {
        $property = Property::query()->forceCreate(['name' => 'Matrix Home']);
        $lock = Lock::factory()->create(['property_id' => $property->id, 'name' => 'Front Door', 'commands_enabled' => true]);
        app(AuditLogger::class)->record('test.event', AuditOutcome::Info);
        $eventId = AuditLog::query()->value('event_id');

        $mismatches = [];
        foreach (Router::getRoutes()->getRoutes() as $route) {
            $name = $route->getName();
            if (! array_key_exists((string) $name, self::ACCESS)) {
                continue;
            }
            $method = collect($route->methods())->first(fn (string $m): bool => $m !== 'HEAD');

            foreach (RoleTemplate::cases() as $template) {
                $user = $this->userWithRole($template, $lock);
                $target = $this->userWithRole(RoleTemplate::Resident, $lock);
                $request = AccessRequest::query()->create([
                    'public_id' => (string) Str::uuid(), 'user_id' => $user->id, 'lock_id' => $lock->id, 'action' => LockAction::Lock,
                    'channel' => AccessChannel::Remote, 'idempotency_key' => Str::random(16), 'status' => AccessRequestStatus::ConfirmedSuccess,
                    'requested_at' => now(), 'expires_at' => now()->addMinute(),
                ]);
                // Asked by someone else, addressed to the user under test.
                $locationRequest = LocationRequest::factory()->create(['requested_by' => $target->id, 'target_user_id' => $user->id]);
                $alert = SecurityAlert::factory()->create();
                $incident = SecurityIncident::factory()->create();
                $notification = $user->notifications()->create(['id' => (string) Str::uuid(), 'type' => 'security_alert', 'data' => ['title' => 'Matrix']]);
                // The caller's own device for their own routes, the other person's for administrators'.
                $device = UserDevice::factory()->create(['user_id' => str_starts_with((string) $name, 'api.v1.auth.') ? $user->id : $target->id]);
                $invitation = Invitation::factory()->create(['invited_by' => $target->id]);
                $uri = '/'.str_replace(
                    ['{lock}', '{user}', '{accessRequest}', '{eventId}', '{locationRequest}', '{alert}', '{incident}', '{notification}', '{device}', '{invitation}'],
                    [$lock->id, $target->id, $request->public_id, $eventId, $locationRequest->public_id, $alert->public_id, $incident->public_id, $notification->id, $device->public_id, $invitation->public_id],
                    $route->uri(),
                );

                $status = $this->actingAs($user)
                    ->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()])
                    ->json($method, $uri, $this->body($name, $property, $target))
                    ->getStatusCode();
                $this->flushSession();
                app('auth')->forgetGuards();

                $allowed = in_array($template->value, self::ACCESS[$name], true);
                if ($allowed ? in_array($status, [401, 403], true) : $status !== 403) {
                    $mismatches[] = sprintf('%s %s as %s: %d, expected %s', $method, $name, $template->value, $status, $allowed ? 'allowed' : '403');
                }

                // Refused even with an empty body: validation must never answer before authorization.
                if (! $allowed && ! array_key_exists($name, self::VALIDATES_FIRST)) {
                    $empty = $this->actingAs($user)
                        ->withSession([CompleteLogin::CONFIRMED_AT_KEY => now()->getTimestamp()])
                        ->json($method, $uri, [])
                        ->getStatusCode();
                    $this->flushSession();
                    app('auth')->forgetGuards();
                    if ($empty !== 403) {
                        $mismatches[] = sprintf('%s %s as %s with an empty body: %d, expected 403', $method, $name, $template->value, $empty);
                    }
                }
            }
        }

        $this->assertSame([], $mismatches);
    }

    private function userWithRole(RoleTemplate $template, Lock $lock): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::query()->where('key', $template->value)->value('id'));
        $user->locks()->attach($lock->id);

        return $user;
    }

    /**
     * A valid body, so validation never answers before authorization does.
     *
     * @return array<string, mixed>
     */
    private function body(string $name, Property $property, User $target): array
    {
        $fix = ['latitude' => 35.0, 'longitude' => -80.0, 'accuracy' => 12, 'captured_at' => now()->toIso8601String()];

        return match ($name) {
            'api.v1.auth.confirm' => ['password' => 'password'],
            'api.v1.auth.mfa.confirm' => ['code' => '000000'],
            'api.v1.users.suspend', 'api.v1.users.reactivate', 'api.v1.users.revoke', 'api.v1.users.sessions.revoke' => ['reason' => 'Access matrix test'],
            'api.v1.users.store' => ['name' => 'New Person', 'email' => Str::random(12).'@example.test', 'password' => 'CorrectHorse123', 'password_confirmation' => 'CorrectHorse123'],
            'api.v1.users.update' => ['name' => 'Renamed Person'],
            'api.v1.users.roles.update' => ['roles' => ['resident']],
            'api.v1.users.permissions.update' => ['overrides' => []],
            'api.v1.permission-preview' => ['roles' => ['resident']],
            'api.v1.locks.commands.store' => ['action' => 'lock', 'idempotency_key' => Str::random(24)],
            'api.v1.properties.store' => ['name' => 'Another Home'],
            'api.v1.locks.store' => ['property_id' => $property->id, 'name' => 'Side Door', 'external_id' => 'MATRIX'.Str::random(8)],
            'api.v1.locks.update' => ['name' => 'Front Door'],
            'api.v1.lock-requests.location.store', 'api.v1.location.requests.respond' => $fix,
            'api.v1.location.requests.store' => ['user_id' => $target->id],
            'api.v1.security.incidents.store' => ['title' => 'Matrix incident', 'severity' => 'medium'],
            'api.v1.security.incidents.status' => ['status' => 'investigating'],
            'api.v1.auth.devices.update', 'api.v1.devices.update' => ['name' => 'Matrix phone'],
            'api.v1.devices.revoke' => ['reason' => 'Access matrix test'],
            'api.v1.invitations.store' => ['email' => Str::random(12).'@example.test'],
            'api.v1.settings.email.update' => ['enabled' => false, 'host' => 'smtp.example.test', 'port' => 587, 'security' => 'starttls', 'from_address' => 'lockguard@example.test', 'from_name' => 'DM LockGuard'],
            'api.v1.settings.email.test' => ['to' => 'matrix@example.test'],
            'api.v1.settings.notifications.update' => ['email_enabled' => true, 'email_min_severity' => 'medium', 'required_categories' => ['security_incident']],
            'api.v1.settings.security.update' => ['mfa_required_roles' => []],
            'api.v1.notifications.preferences.update' => ['preferences' => ['battery_warning' => ['in_app' => true, 'email' => false]]],
            default => [],
        };
    }
}
