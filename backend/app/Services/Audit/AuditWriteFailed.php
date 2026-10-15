<?php

namespace App\Services\Audit;

use RuntimeException;

/**
 * Thrown when an audit record cannot be written. Sensitive operations must fail with it.
 */
class AuditWriteFailed extends RuntimeException {}
