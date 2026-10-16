<?php

namespace App\Services\Locks\Integration;

use RuntimeException;

/**
 * The integration could not be reached or refused the command; the command was certainly NOT delivered.
 */
class IntegrationUnavailable extends RuntimeException {}
