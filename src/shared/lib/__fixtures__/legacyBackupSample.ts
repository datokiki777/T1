/**
 * Faithful sample of the old vanilla-JS app's actual export shape, built
 * field-for-field from its real source (js/03-state.js normalizeAppState/
 * normalizeGroupData, js/16-import-export.js handleExportJson) — not a
 * guess. Covers everything the migration must preserve: multiple groups
 * (one archived), multiple periods, paidWeeks, every status value,
 * comments, decimal amounts, and the legacy "defaultSalaryAmount" field
 * alias that only ever existed in even older exports.
 */
export const legacyWrappedBackup = {
  __type: "client_totals_all_groups",
  __ver: 1,
  exportedAt: "2025-03-01T10:00:00.000Z",
  data: {
    activeGroupId: "grp-1",
    lastActiveGroupIdActive: "grp-1",
    lastActiveGroupIdArchive: "",
    workspaceMode: "active",
    grandMode: "active",
    lastReviewGrandMode: "active",
    uiMode: "review",
    dataUpdatedAt: "2025-03-01T09:00:00.000Z",
    reviewCollapsedGroups: { "grp-1": false },
    groups: [
      {
        id: "grp-1",
        name: "Client Group A",
        archived: false,
        data: {
          defaultRatePercent: 13.5,
          defaultSalaryPer28Days: 400,
          periods: [
            {
              id: "per-1",
              from: "2025-01-01",
              to: "2025-01-31",
              paidWeeks: "3",
              rows: [
                {
                  id: "row-1",
                  customer: "Acme Corp",
                  city: "Tbilisi",
                  gross: "1234.56",
                  net: "987.65",
                  comment: "Wants a follow-up call next month",
                  done: "done",
                },
                {
                  id: "row-2",
                  customer: "Beta LLC",
                  city: "Batumi",
                  gross: "500",
                  net: "",
                  comment: "",
                  done: "fail",
                },
                {
                  id: "row-3",
                  customer: "Wrong Entry",
                  city: "Kutaisi",
                  gross: "999",
                  net: "999",
                  comment: "entered by mistake",
                  done: "wrong",
                },
                {
                  id: "row-4",
                  customer: "Fixed Client",
                  city: "",
                  gross: "250.25",
                  net: "",
                  comment: "",
                  done: "fixed",
                },
                {
                  id: "row-5",
                  customer: "No Status Client",
                  city: "Rustavi",
                  gross: "10",
                  net: "",
                  comment: "",
                  done: "none",
                },
              ],
            },
            {
              id: "per-2",
              from: "2025-02-01",
              to: "",
              paidWeeks: "",
              rows: [
                {
                  id: "row-6",
                  customer: "Second Period Client",
                  city: "Poti",
                  gross: "1.234,56",
                  net: "",
                  comment: "European decimal format",
                  done: "none",
                },
              ],
            },
          ],
        },
      },
      {
        id: "grp-2",
        name: "Archived Group B",
        archived: true,
        data: {
          // Legacy field name alias — some very old exports used this
          // instead of defaultSalaryPer28Days.
          defaultSalaryAmount: 150,
          defaultRatePercent: 20,
          periods: [
            {
              id: "per-3",
              from: "2024-06-01",
              to: "2024-06-14",
              paidWeeks: "2",
              rows: [
                {
                  id: "row-7",
                  customer: "Old Client",
                  city: "Zugdidi",
                  gross: "800",
                  net: "600",
                  comment: "Long-time repeat customer",
                  done: "done",
                },
              ],
            },
          ],
        },
      },
    ],
  },
};

/** The old app's import also accepts the raw appState with no __type wrapper. */
export const legacyUnwrappedBackup = legacyWrappedBackup.data;
