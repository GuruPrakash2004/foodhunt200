/** "9876543210" -> "+91 98765 43210" */
export const formatMobile = (m) => (m ? `+91 ${m.slice(0, 5)} ${m.slice(5)}` : "");
export const isValidMobile = (value) => /^[6-9]\d{9}$/.test(value.replace(/\D/g, "").slice(-10)) && value.replace(/\D/g, "").length >= 10;
export const initialOf = (name) => (name || "?").trim().charAt(0).toUpperCase();
