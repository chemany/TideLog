// backend/outlook_ews_sync.js

const {
    ExchangeService, 
    WebCredentials, 
    Uri, 
    FolderId, 
    WellKnownFolderName, 
    CalendarView, 
    PropertySet, 
    BasePropertySet, 
    ItemSchema, 
    AppointmentSchema,
    DateTime, 
    ExchangeVersion 
} = require('ews-javascript-api');
const { uuidv4 } = require('./storage'); // For generating event IDs if needed
const { getStartEndDateForSync } = require('./utils'); // Assuming date helper is in utils.js

/**
 * Synchronizes a standard Outlook/Exchange mailbox using EWS.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password or app password.
 * @param {object} settings - Additional settings (e.g., ewsUrl, exchangeVersion).
 * @returns {Promise<object>} - A promise resolving with sync results or an error object.
 */
async function syncOutlookViaEWS(email, password, settings = {}) {
    console.log(`[Outlook EWS] Starting sync for ${email}`);
    
    let syncResults = {
        success: false,
        message: 'Sync initialization failed.',
        events: [], // We will populate this with formatted event data
        error: null,
        itemCount: 0,
        newItemCount: 0 // Keep track of newly added items
    };

    try {
        // --- Migrated EWS Logic --- 
        console.log("[Outlook EWS] Initializing ExchangeService...");
        
        // Determine Exchange Version
        let exchangeVersion = ExchangeVersion.Exchange2013; // Default
        if (settings.exchangeVersion) {
            const versionKey = settings.exchangeVersion.toUpperCase().replace('_', '');
            if (ExchangeVersion[versionKey]) {
                exchangeVersion = ExchangeVersion[versionKey];
            } else {
                console.warn(`[Outlook EWS] Unknown Exchange version: ${settings.exchangeVersion}, using default ${ExchangeVersion[exchangeVersion]}`);
            }
        }
        console.log(`[Outlook EWS] Using Exchange Version: ${ExchangeVersion[exchangeVersion]}`);
        const service = new ExchangeService(exchangeVersion);

        // Set Credentials (Basic Auth for now, TODO: Add OAuth support)
        service.Credentials = new WebCredentials(email, password);

        // Determine EWS Endpoint: Use known M365 endpoint, specified URL, or fallback to Autodiscover (removed fallback)
        const knownM365Endpoint = 'https://outlook.office365.com/EWS/Exchange.asmx';
        if (settings.ewsUrl) {
            console.log(`[Outlook EWS] Using provided EWS URL: ${settings.ewsUrl}`);
            service.Url = new Uri(settings.ewsUrl);
        } else { // Default to known M365 endpoint if no specific URL is given
            console.log(`[Outlook EWS] Assuming M365/Outlook.com account. Using known endpoint: ${knownM365Endpoint}`);
            service.Url = new Uri(knownM365Endpoint);
        }

        // Define time range for sync
        const { startDate, endDate } = getStartEndDateForSync();
        const startDateTime = new DateTime(startDate);
        const endDateTime = new DateTime(endDate);
        console.log(`[Outlook EWS] Fetching events from ${startDateTime.ToISOString()} to ${endDateTime.ToISOString()}`);

        // Create CalendarView
        const calendarView = new CalendarView(startDateTime, endDateTime);
        
        // Define required properties for the initial FindItems call (excluding Body)
        calendarView.PropertySet = new PropertySet(
            BasePropertySet.IdOnly, 
            ItemSchema.Subject,
            AppointmentSchema.Start,
            AppointmentSchema.End,
            AppointmentSchema.IsAllDayEvent,
            AppointmentSchema.Location,
            ItemSchema.DateTimeCreated,
            ItemSchema.LastModifiedTime
        );

        // Specify Calendar folder
        const calendarFolderId = new FolderId(WellKnownFolderName.Calendar);

        console.log("[Outlook EWS] Finding calendar items (without body)...");
        const findResults = await service.FindItems(calendarFolderId, calendarView);

        syncResults.itemCount = findResults.TotalCount;
        console.log(`[Outlook EWS] Found ${findResults.TotalCount} calendar items on server.`);

        // Process found items
        const formattedEvents = [];
        if (findResults.TotalCount > 0) {
            // Define a PropertySet to load the Body for each item
            const bodyPropertySet = new PropertySet(ItemSchema.Body);

            for (const item of findResults.Items) {
                try {
                    // Load the body for the current item
                    console.log(`[Outlook EWS] Loading body for item ID ${item.Id?.UniqueId}...`);
                    await item.Load(bodyPropertySet);
                    console.log(`[Outlook EWS] Body loaded for item ID ${item.Id?.UniqueId}.`);

                    // Format event data similar to how python script did
                    const eventData = {
                        id: item.Id.UniqueId,
                        exchange_id: item.Id.UniqueId,
                        change_key: item.Id.ChangeKey,
                        title: item.Subject || "(No Subject)",
                        start_datetime: item.Start ? new Date(item.Start).toISOString() : null,
                        end_datetime: item.End ? new Date(item.End).toISOString() : null,
                        description: item.Body?.Text || "", // Now item.Body should be populated
                        location: item.Location || "",
                        all_day: item.IsAllDayEvent || false,
                        source: "outlook_ews_js_sync",
                        created_at: item.DateTimeCreated ? new Date(item.DateTimeCreated).toISOString() : null,
                        updated_at: item.LastModifiedTime ? new Date(item.LastModifiedTime).toISOString() : new Date().toISOString(),
                        needs_caldav_push: false,
                        caldav_uid: null,
                        caldav_etag: null
                    };
                    formattedEvents.push(eventData);
                } catch (itemError) {
                    console.error(`[Outlook EWS] Error processing item ID ${item.Id?.UniqueId} after attempting to load body:`, itemError);
                }
            }
        }
        
        syncResults.events = formattedEvents; 
        // newItemCount calculation would require comparing with local DB, skipping for now
        syncResults.newItemCount = formattedEvents.length; // Simplified: count all fetched as potentially new
        
        syncResults.success = true;
        syncResults.message = `Outlook EWS sync completed. Found ${findResults.TotalCount} items. Processed ${formattedEvents.length} items.`;
        console.log("[Outlook EWS] Sync process finished.");
        // --- End of Migrated Logic --- 

    } catch (error) {
        // Error handling is now moved outside this block
        console.error("[Outlook EWS] Error caught in outer block:", error);
        // Re-throw to be caught by the main catch block that formats syncResults.error
        throw error; 
    }

    // Final return is handled by the outer try/catch
    // return syncResults; // Now returned by the main function block
}

module.exports = { syncOutlookViaEWS }; 