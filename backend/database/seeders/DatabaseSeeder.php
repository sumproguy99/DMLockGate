<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     *
     * No user accounts are seeded: the first administrator is created with an Artisan command
     * so that no default credentials ever exist.
     */
    public function run(): void
    {
        $this->call(PermissionCatalogSeeder::class);
    }
}
