app_name = "piyam_ims_bridge"
app_title = "Piyam IMS Bridge"
app_publisher = "Piyam Travel"
app_description = "IMS handoff and branding bridge for Piyam Travel Frappe HRMS"
app_email = "hasnain@piyamtravel.com"
app_license = "MIT"

app_include_js = "/assets/piyam_ims_bridge/js/ims_nav.js"

before_request = [
    "piyam_ims_bridge.api.handoff.guard_direct_access",
]
