# Free hosting cutover

The app layer targets `swa-pokemon-tracker-free` on Free without a managed ***. The backend already supports the existing AZURE_STORAGE_CONNECTION_STRING setting; transfer it securely out of band. Never put its value in source or deployment logs. The existing locked data layer is not recreated or changed by the app template.

Deployment uses the existing AZURE_STATIC_WEB_APPS_API_TOKEN repository secret. Retarget that secret only after new-app validation, preserving the previous token privately for rollback. The migration branch trigger permits a known-source initial production deployment without merging the default branch; workflow_dispatch is available after merge. Delete the migration branch after approved landing.

SWA user IDs are per-app. A replacement app can produce a different principal ID for the same human, while existing storage is under users/{principalId}/. Before retiring the previous app, verify genuine sign-in to both apps, bind the new principal to the same provider account, and migrate only that user's namespace with parity checks and preserved original bytes. Reusing storage configuration alone does not prove signed-in data continuity. Do not enable LOCAL_USER_ID or weaken authorization as a shortcut. Keep the old app until data, API and login checks pass.

Free has no paid app *** or SLA. Built-in GitHub/Microsoft auth and managed Python API routes are unchanged. No changes to data storage lifecycle, privileges or application behavior are part of this migration.
