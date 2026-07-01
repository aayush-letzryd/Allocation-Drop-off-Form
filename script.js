/* ═══════════════════════════════════════════════════════════
   LetzRyd Partner Allocation Portal — script.js
   SurveyJS Form + Metrics Dashboard + Records Table
═══════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────
// SurveyJS Form Definition (Mapped to Allocation Sheet)
// ─────────────────────────────────────────────────────────
const surveyJson = {
    showQuestionNumbers: "off",
    widthMode: "responsive",

    // Custom completion HTML (shown after a successful submit)
    completedHtml: `
        <div style="text-align:center;padding:48px 24px;">
            <svg style="width:64px;height:64px;color:#1ab394;margin:0 auto 20px;display:block;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="22 4 12 14.01 9 11.01" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <h2 style="font-size:22px;font-weight:700;color:#0a1650;margin-bottom:8px;font-family:'Poppins',sans-serif;">Allocation Recorded Successfully</h2>
            <p style="color:#64748b;font-size:14px;margin-bottom:28px;font-family:'DM Sans',sans-serif;">The vehicle assignment and dropoff details have been securely saved.</p>
            <button onclick="startNewAllocation()" style="background:#1ab394;color:#fff;border:none;border-radius:8px;padding:10px 28px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">
                + Process Another Assignment
            </button>
        </div>
    `,

    elements: [
        // ROW 1: The 3 Main Panels
        {
            type: "panel",
            name: "allocation_info_panel",
            title: "1. ALLOCATION DETAILS",
            width: "33%",
            elements: [
                {
                    type: "text",
                    name: "allocation_date",
                    title: "📅 DATE OF ALLOCATION",
                    inputType: "date",
                    isRequired: true
                },
                {
                    type: "radiogroup",
                    name: "allocation_type",
                    title: "🔄 ALLOCATION TYPE",
                    choices: ["New Allocation", "Car Swap", "Reallocation"],
                    colCount: 1,
                    isRequired: true
                },
                {
                    type: "dropdown",
                    name: "city_name",
                    title: "🏙️ CITY",
                    placeholder: "Select operating city...",
                    isRequired: true,
                    choicesByUrl: { url: "/api/cities", valueName: "value", titleName: "text" }
                }
            ]
        },
        {
            type: "panel",
            name: "driver_info_panel",
            title: "2. DRIVER INFORMATION",
            width: "33%",
            startWithNewLine: false,
            elements: [
                {
                    type: "text",
                    name: "driver_id",
                    title: "🆔 OPERATOR / DRIVER ID",
                    placeholder: "Unique LetzRyd ID...",
                    isRequired: true
                },
                {
                    type: "text",
                    name: "driver_name",
                    title: "👤 DRIVER NAME",
                    placeholder: "Enter full name...",
                    isRequired: true
                },
                {
                    type: "text",
                    name: "driver_phone",
                    title: "📞 DRIVER PHONE NUMBER",
                    inputType: "tel",
                    placeholder: "+91 10-digit mobile...",
                    isRequired: true
                }
            ]
        },
        {
            type: "panel",
            name: "vehicle_info_panel",
            title: "3. VEHICLE & PLAN",
            width: "34%",
            startWithNewLine: false,
            elements: [
                {
                    type: "text",
                    name: "driver_plan",
                    title: "📋 DRIVER PLAN",
                    placeholder: "e.g., Subscription, Lease..."
                },
                {
                    type: "text",
                    name: "type_of_plan",
                    title: "🏷️ TYPE OF PLAN",
                    placeholder: "e.g., Bronze, Silver, Gold..."
                },
                {
                    type: "text",
                    name: "car_model",
                    title: "🚙 CAR MODEL",
                    placeholder: "e.g., Tata Nexon EV..."
                },
                {
                    type: "text",
                    name: "vehicle_number",
                    title: "🔢 VEHICLE NUMBER (NEW)",
                    placeholder: "e.g., TS09 EA 1234...",
                    isRequired: true
                }
            ]
        },
        // ROW 2: The Conditional Dropoff Panel
        {
            type: "panel",
            name: "dropoff_details_panel",
            title: "4. DROPOFF DETAILS (CAR RETURN)",
            description: "Record details of the old vehicle being returned by the partner.",
            width: "100%",
            // THIS IS THE MAGIC LOGIC: Only show if Swap or Reallocation is chosen
            visibleIf: "{allocation_type} = 'Car Swap' or {allocation_type} = 'Reallocation'",
            elements: [
                {
                    type: "text",
                    name: "old_vehicle_number",
                    title: "🔙 OLD VEHICLE NUMBER",
                    placeholder: "Vehicle being returned...",
                    isRequired: true
                },
                {
                    type: "text",
                    name: "dropoff_odometer",
                    title: "⏱️ DROPOFF ODOMETER (KM)",
                    inputType: "number",
                    placeholder: "Current reading...",
                    isRequired: true
                },
                {
                    type: "text",
                    name: "dropoff_remarks",
                    title: "📝 DROPOFF REMARKS",
                    placeholder: "Condition, damages, etc..."
                },
                {
                    type: "file",
                    name: "dropoff_photo",
                    title: "📸 VEHICLE CONDITION PHOTO",
                    placeholder: "Upload Proof\nTap to upload",
                    acceptedTypes: "image/*",
                    storeDataAsText: true,
                    allowCameraAccess: true,
                    width: "25%"
                }
            ]
        }
    ]
};

// ─────────────────────────────────────────────────────────
// Survey instance
// ─────────────────────────────────────────────────────────
const survey = new Survey.Model(surveyJson);
let allocationId = null; // null = new record, integer = editing existing

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function loadAllocationIntoForm(id) {
    fetch("/api/allocation/" + id)
        .then(function (r) {
            if (!r.ok) throw new Error("Not found");
            return r.json();
        })
        .then(function (data) {
            allocationId = id;
            var d = {
                allocation_date:    data.allocation_date,
                allocation_type:    data.allocation_type,
                city_name:          data.city_name,
                driver_id:          data.driver_id,
                driver_name:        data.driver_name,
                driver_phone:       data.driver_phone,
                driver_plan:        data.driver_plan || "",
                type_of_plan:       data.type_of_plan || "",
                car_model:          data.car_model || "",
                vehicle_number:     data.vehicle_number,
                
                // Conditional Dropoff Data
                old_vehicle_number: data.old_vehicle_number || "",
                dropoff_odometer:   data.dropoff_odometer || "",
                dropoff_remarks:    data.dropoff_remarks || ""
            };
            survey.data = d;

            updateFormBanner(true, id);
            showTab("form");
            scrollToForm();
        })
        .catch(function () {
            alert("Record #" + id + " not found in database.");
            allocationId = null;
            updateFormBanner(false, null);
        });
}

function updateFormBanner(editing, id) {
    var el = document.querySelector(".lr-fch-desc");
    if (el) {
        el.textContent = editing ? ("Editing existing allocation record #" + id) : "Assign new vehicles, process car swaps, and manage dropoff records for fleet partners.";
    }
}

function scrollToForm() {
    var el = document.getElementById("surveyElement");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function extractImage(val) {
    if (!val) return null;
    if (Array.isArray(val) && val.length > 0) {
        var first = val[0];
        return (typeof first === "object" && first.content) ? first.content : String(first);
    }
    if (typeof val === "string" && val.startsWith("data:")) return val;
    return null;
}

// ─────────────────────────────────────────────────────────
// Submit handler (API POST/PUT mapped to FastAPI)
// ─────────────────────────────────────────────────────────
survey.onComplete.add(function (sender) {
    var d = sender.data;

    var payload = {
        allocation_date:    d.allocation_date,
        allocation_type:    d.allocation_type,
        city_name:          d.city_name,
        driver_id:          d.driver_id,
        driver_name:        d.driver_name,
        driver_phone:       d.driver_phone,
        driver_plan:        d.driver_plan,
        type_of_plan:       d.type_of_plan,
        car_model:          d.car_model,
        vehicle_number:     d.vehicle_number,

        // Conditional Dropoff Fields
        old_vehicle_number: d.old_vehicle_number,
        dropoff_odometer:   d.dropoff_odometer,
        dropoff_remarks:    d.dropoff_remarks,
        dropoff_photo:      extractImage(d.dropoff_photo)
    };

    var url    = allocationId ? ("/api/allocation/" + allocationId) : "/api/allocation";
    var method = allocationId ? "PUT" : "POST";

    fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t); });
        return r.json();
    })
    .then(function (result) {
        if (result.success) {
            allocationId = null;
            updateFormBanner(false, null);
        } else {
            throw new Error("Server returned success=false");
        }
    })
    .catch(function (err) {
        alert("Failed to save allocation record: " + err.message);
        survey.clear(true, true);
    });
});

// ─────────────────────────────────────────────────────────
// Initialize SurveyJS into DOM
// ─────────────────────────────────────────────────────────
$(function () {
    $("#surveyElement").Survey({ model: survey });
});

// ─────────────────────────────────────────────────────────
// New Record (reset everything)
// ─────────────────────────────────────────────────────────
window.startNewAllocation = function() {
    allocationId = null;
    survey.clear(true, true);
    updateFormBanner(false, null);
    scrollToForm();
};

// ─────────────────────────────────────────────────────────
// Tabs (Maintains framework for Future Updates)
// ─────────────────────────────────────────────────────────
window.showTab = function(tab) {
    var formTab = document.getElementById("tab-form");
    if (formTab) formTab.style.display = (tab === 'form') ? 'block' : 'none';
};

// ─────────────────────────────────────────────────────────
// Live clock (IST)
// ─────────────────────────────────────────────────────────
function updateClock() {
    var el = document.getElementById("liveClock");
    if (el) {
        el.textContent = new Date().toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour12: true
        });
    }
}
setInterval(updateClock, 1000);
updateClock();

// ─────────────────────────────────────────────────────────
// Retrieve & Bind Record via Header Search Bar
// ─────────────────────────────────────────────────────────
window.retrieveAllocationRecord = function() {
    var idInput = document.getElementById("allocationIdInput");
    if (!idInput || !idInput.value.trim()) {
        alert("Please enter a valid allocation record ID.");
        return;
    }
    
    var recordId = parseInt(idInput.value.trim(), 10);
    if (isNaN(recordId)) {
        alert("Record ID must be a number.");
        return;
    }
    
    loadAllocationIntoForm(recordId);
};