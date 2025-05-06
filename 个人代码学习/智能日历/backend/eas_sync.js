const asclient = require('asclient');
const { uuidv4 } = require('./storage'); // Re-use uuid generator if needed

/**
 * Attempts to synchronize QQ Mailbox using Exchange ActiveSync (EAS).
 * @param {string} email - The user's QQ email address.
 * @param {string} password - The QQ authorization code (app-specific password).
 * @returns {Promise<object>} - A promise that resolves with the sync result or rejects with an error.
 */
async function syncQQViaEAS(email, password) {
    console.log(`[EAS Sync] Starting sync for ${email}`);

    // --- EAS Configuration ---
    const easEndpoint = 'https://ex.qq.com/Microsoft-Server-ActiveSync'; // Standard EAS endpoint for QQ
    // Generate a somewhat stable device ID for this user/app instance
    // NOTE: EAS often limits the number of devices per account.
    // A real app might store/retrieve this ID per user.
    const deviceId = 'SCAL' + Buffer.from(email).toString('hex').slice(0, 16); // Simple ID based on email prefix
    const deviceType = 'SmartCalendarNode'; // Custom device type

    const options = {
        username: email,
        password: password,
        endpoint: easEndpoint,
        // policyKey: '0', // Start with default policy key
        // folderSyncKey: '0', // Start with default folder sync key
        device: {
            id: deviceId,
            type: deviceType,
            // Optional fields:
            // model: 'SC1000',
            // operatingSystem: 'NodeJS',
            // userAgent: 'SmartCalendarBackend/1.0'
        },
        // --- Important for QQ/Self-signed certs potentially ---
        // The 'requests' library used by asclient might need adjustment
        // for TLS verification, but asclient doesn't expose this easily.
        // We might need to patch `request` globally if SSL errors occur.
        // For now, we rely on default Node.js TLS handling.
    };

    console.log(`[EAS Sync] Using Endpoint: ${options.endpoint}`);
    console.log(`[EAS Sync] Using Device ID: ${options.device.id}, Type: ${options.device.type}`);

    const mailClient = asclient(options);
    let syncResults = {
        success: false,
        message: 'Sync not fully completed.',
        folders: [],
        calendarEventsRaw: [], // Store raw synced calendar items here
        error: null,
    };

    try {
        // 1. Provision Device (Get Policy Key)
        console.log("[EAS Sync] Step 1: Provisioning device...");
        await mailClient.provision();
        console.log(`[EAS Sync] Provisioning successful. Policy Key: ${mailClient.opts.policyKey}`);
        syncResults.policyKey = mailClient.opts.policyKey; // Store policy key

        // 2. Sync Folders (Get Folder Hierarchy and Sync Key)
        console.log("[EAS Sync] Step 2: Syncing folders...");
        await mailClient.folderSync();
        console.log(`[EAS Sync] Folder sync successful. Found ${mailClient.opts.folders.length} folders. Folder Sync Key: ${mailClient.opts.folderSyncKey}`);
        syncResults.folders = mailClient.opts.folders.map(f => ({ id: f.id, name: f.name, type: f.type })); // Extract relevant folder info
        syncResults.folderSyncKey = mailClient.opts.folderSyncKey;

        // 3. Enable Calendar Sync (Mark calendar folders for syncing)
        // Note: This flags *all* folders identified as calendar type.
        console.log("[EAS Sync] Step 3: Enabling calendar sync...");
        await mailClient.enableCalendarSync(); // This modifies mailClient.opts.folders internally
        const calendarFoldersToSync = mailClient.opts.folders.filter(f => f.sync === true && f.type === 13); // Type 13 is typically Calendar
        console.log(`[EAS Sync] Marked ${calendarFoldersToSync.length} calendar folder(s) for sync.`);
        if (calendarFoldersToSync.length === 0) {
             console.warn("[EAS Sync] No calendar folders found or marked for sync.");
             // Proceed without calendar sync if none found
        }

        // 4. Perform Actual Sync (Fetch content for marked folders)
        if (calendarFoldersToSync.length > 0) {
             console.log("[EAS Sync] Step 4: Performing content sync for marked folders...");
             await mailClient.sync(); // Fetches content into mailClient.contents
             console.log(`[EAS Sync] Content sync successful. Sync Key: ${mailClient.opts.syncKey}`);
             syncResults.syncKey = mailClient.opts.syncKey;

             // Process synced content (mailClient.contents might be complex)
             // The structure of mailClient.contents isn't documented well.
             // We need to inspect it to find calendar items.
             // Assuming contents is an array of items with folderId and properties
             if (mailClient.contents && Array.isArray(mailClient.contents)) {
                 console.log(`[EAS Sync] Received ${mailClient.contents.length} raw items in sync.`);
                 // Filter for items belonging to the calendar folders we marked
                 const calendarFolderIds = new Set(calendarFoldersToSync.map(f => f.id));
                 syncResults.calendarEventsRaw = mailClient.contents.filter(item => calendarFolderIds.has(item.folderId));
                 console.log(`[EAS Sync] Filtered ${syncResults.calendarEventsRaw.length} items potentially from calendar folders.`);
                 // TODO: Further parse syncResults.calendarEventsRaw based on its actual structure
             } else {
                  console.log("[EAS Sync] mailClient.contents is not an array or is empty after sync.");
             }
        } else {
             console.log("[EAS Sync] Step 4: Skipping content sync as no calendar folders were marked.");
        }


        syncResults.success = true;
        syncResults.message = 'EAS sync process completed (provisioning, folder sync, and attempted content sync).';
        console.log("[EAS Sync] Sync process finished successfully (as far as the library reported).");

    } catch (error) {
        console.error("[EAS Sync] Error during synchronization:", error);
        syncResults.message = `EAS sync failed: ${error.message}`;
        syncResults.error = {
            message: error.message,
            stack: error.stack,
            details: error // Include the full error object if possible
        };
    }

    return syncResults;
}

module.exports = { syncQQViaEAS }; 