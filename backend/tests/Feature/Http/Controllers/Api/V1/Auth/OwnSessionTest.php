<?php

namespace Tests\Feature\Http\Controllers\Api\V1\Auth;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * GET /api/v1/auth/sessions and DELETE /api/v1/auth/sessions/others: the user's own sign-ins.
 */
class OwnSessionTest extends TestCase
{
    use RefreshDatabase;

    private const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';

    private const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0';

    protected function setUp(): void
    {
        parent::setUp();

        config(['session.driver' => 'database']);
        $this->withHeader('Origin', 'http://localhost');
    }

    private function storedSession(User $user, string $userAgent, int $minutesAgo, ?string $id = null): string
    {
        $id ??= Str::random(40);
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $user->id,
            'ip_address' => '192.0.2.10',
            'user_agent' => $userAgent,
            'payload' => '',
            'last_activity' => now()->subMinutes($minutesAgo)->getTimestamp(),
        ]);

        return $id;
    }

    public function test_requires_a_session(): void
    {
        $this->getJson(route('api.v1.auth.sessions.index'))->assertUnauthorized();
        $this->deleteJson(route('api.v1.auth.sessions.destroy-others'))->assertUnauthorized();
    }

    public function test_lists_only_the_users_own_sessions_without_their_ids(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $phone = $this->storedSession($user, self::CHROME_ANDROID, 2);
        $this->storedSession($user, self::EDGE_WINDOWS, 30);
        $this->storedSession($other, self::EDGE_WINDOWS, 1);

        $response = $this->actingAs($user)->getJson(route('api.v1.auth.sessions.index'))->assertOk();

        $response->assertJsonPath('data.listed', true)
            ->assertJsonCount(2, 'data.sessions')
            ->assertJsonPath('data.sessions.0.device', 'Chrome on Android')
            ->assertJsonPath('data.sessions.1.device', 'Edge on Windows')
            ->assertJsonPath('data.sessions.0.ip_address', '192.0.2.10')
            ->assertJsonPath('data.api_clients', 0);
        $this->assertStringNotContainsString($phone, $response->getContent());
    }

    public function test_signing_out_others_ends_every_other_session_and_token_and_is_audited(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $phone = $this->storedSession($user, self::CHROME_ANDROID, 2);
        $laptop = $this->storedSession($user, self::EDGE_WINDOWS, 30);
        $neighbours = $this->storedSession($other, self::EDGE_WINDOWS, 1);
        $user->createToken('old phone');

        $this->actingAs($user)->deleteJson(route('api.v1.auth.sessions.destroy-others'))
            ->assertOk()
            ->assertJsonPath('data.signed_out.browser_logins', 2)
            ->assertJsonPath('data.signed_out.api_clients', 1);

        // Only this request's own session is left.
        $this->assertFalse(DB::table('sessions')->whereIn('id', [$phone, $laptop])->exists());
        $this->assertLessThanOrEqual(1, DB::table('sessions')->where('user_id', $user->id)->count());
        $this->assertTrue(DB::table('sessions')->where('id', $neighbours)->exists());
        $this->assertSame(0, $user->tokens()->count());
        $this->assertTrue(AuditLog::query()->where('action', 'auth.other_sessions_signed_out')->where('actor_user_id', $user->id)->exists());
    }
}
