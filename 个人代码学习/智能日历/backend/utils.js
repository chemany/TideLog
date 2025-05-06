/**
 * Calculates the start and end date for a typical sync window.
 * Start date: First day of the previous month.
 * End date: Last day (23:59:59) of the next month.
 * @returns {{startDate: Date, endDate: Date}}
 */
function getStartEndDateForSync() {
    const now = new Date();
    // Start date: First day of the previous month
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // End date: Last day of the *next* month (correcting previous comment)
    // Setting day to 0 of month+2 gives the last day of month+1
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
    return { startDate, endDate };
}

module.exports = {
    getStartEndDateForSync
}; 