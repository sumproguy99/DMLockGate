<?php

namespace App\Services\Locks\Integration;

use RuntimeException;

/**
 * The command may have reached the lock (for example a timeout after sending). Never retry blindly:
 * reconcile against the reported state instead.
 */
class IntegrationOutcomeUnknown extends RuntimeException {}
