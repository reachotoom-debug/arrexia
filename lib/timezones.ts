export interface TimezoneOption {
  value: string; // IANA id, e.g. "Asia/Amman"
  label: string; // human friendly, e.g. "Asia/Amman (Amman)"
}

// Common IANA timezones (global list). Used for Settings combobox.
// Note: we allow saving custom/unknown IANA strings as well.
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // UTC / Etc
  { value: "UTC", label: "UTC" },
  { value: "Etc/GMT", label: "Etc/GMT" },
  { value: "Etc/UTC", label: "Etc/UTC" },

  // Africa
  { value: "Africa/Cairo", label: "Africa/Cairo (Cairo)" },
  { value: "Africa/Casablanca", label: "Africa/Casablanca (Casablanca)" },
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg (Johannesburg)" },
  { value: "Africa/Lagos", label: "Africa/Lagos (Lagos)" },
  { value: "Africa/Nairobi", label: "Africa/Nairobi (Nairobi)" },
  { value: "Africa/Tunis", label: "Africa/Tunis (Tunis)" },
  { value: "Africa/Windhoek", label: "Africa/Windhoek (Windhoek)" },

  // America — North
  { value: "America/Anchorage", label: "America/Anchorage (Anchorage)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (Los Angeles)" },
  { value: "America/Vancouver", label: "America/Vancouver (Vancouver)" },
  { value: "America/Denver", label: "America/Denver (Denver)" },
  { value: "America/Phoenix", label: "America/Phoenix (Phoenix)" },
  { value: "America/Chicago", label: "America/Chicago (Chicago)" },
  { value: "America/Mexico_City", label: "America/Mexico_City (Mexico City)" },
  { value: "America/New_York", label: "America/New_York (New York)" },
  { value: "America/Toronto", label: "America/Toronto (Toronto)" },
  { value: "America/Halifax", label: "America/Halifax (Halifax)" },
  { value: "America/St_Johns", label: "America/St_Johns (St. John's)" },

  // America — Central/South
  { value: "America/Bogota", label: "America/Bogota (Bogotá)" },
  { value: "America/Lima", label: "America/Lima (Lima)" },
  { value: "America/Santiago", label: "America/Santiago (Santiago)" },
  { value: "America/Caracas", label: "America/Caracas (Caracas)" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires (Buenos Aires)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (São Paulo)" },
  { value: "America/Montevideo", label: "America/Montevideo (Montevideo)" },

  // Asia — Middle East
  { value: "Asia/Amman", label: "Asia/Amman (Amman)" },
  { value: "Asia/Baghdad", label: "Asia/Baghdad (Baghdad)" },
  { value: "Asia/Beirut", label: "Asia/Beirut (Beirut)" },
  { value: "Asia/Damascus", label: "Asia/Damascus (Damascus)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (Dubai)" },
  { value: "Asia/Jerusalem", label: "Asia/Jerusalem (Jerusalem)" },
  { value: "Asia/Kuwait", label: "Asia/Kuwait (Kuwait City)" },
  { value: "Asia/Qatar", label: "Asia/Qatar (Doha)" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh (Riyadh)" },
  { value: "Asia/Tehran", label: "Asia/Tehran (Tehran)" },

  // Asia — South/Central
  { value: "Asia/Karachi", label: "Asia/Karachi (Karachi)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (India)" },
  { value: "Asia/Kathmandu", label: "Asia/Kathmandu (Kathmandu)" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka (Dhaka)" },
  { value: "Asia/Tashkent", label: "Asia/Tashkent (Tashkent)" },
  { value: "Asia/Almaty", label: "Asia/Almaty (Almaty)" },

  // Asia — East/Southeast
  { value: "Asia/Bangkok", label: "Asia/Bangkok (Bangkok)" },
  { value: "Asia/Ho_Chi_Minh", label: "Asia/Ho_Chi_Minh (Ho Chi Minh City)" },
  { value: "Asia/Jakarta", label: "Asia/Jakarta (Jakarta)" },
  { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur (Kuala Lumpur)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (Singapore)" },
  { value: "Asia/Manila", label: "Asia/Manila (Manila)" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong (Hong Kong)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (Shanghai)" },
  { value: "Asia/Seoul", label: "Asia/Seoul (Seoul)" },
  { value: "Asia/Taipei", label: "Asia/Taipei (Taipei)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (Tokyo)" },

  // Europe
  { value: "Europe/London", label: "Europe/London (London)" },
  { value: "Europe/Dublin", label: "Europe/Dublin (Dublin)" },
  { value: "Europe/Lisbon", label: "Europe/Lisbon (Lisbon)" },
  { value: "Europe/Paris", label: "Europe/Paris (Paris)" },
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam (Amsterdam)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (Berlin)" },
  { value: "Europe/Rome", label: "Europe/Rome (Rome)" },
  { value: "Europe/Madrid", label: "Europe/Madrid (Madrid)" },
  { value: "Europe/Zurich", label: "Europe/Zurich (Zurich)" },
  { value: "Europe/Stockholm", label: "Europe/Stockholm (Stockholm)" },
  { value: "Europe/Athens", label: "Europe/Athens (Athens)" },
  { value: "Europe/Istanbul", label: "Europe/Istanbul (Istanbul)" },
  { value: "Europe/Kyiv", label: "Europe/Kyiv (Kyiv)" },
  { value: "Europe/Moscow", label: "Europe/Moscow (Moscow)" },

  // Oceania
  { value: "Australia/Perth", label: "Australia/Perth (Perth)" },
  { value: "Australia/Adelaide", label: "Australia/Adelaide (Adelaide)" },
  { value: "Australia/Brisbane", label: "Australia/Brisbane (Brisbane)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (Sydney)" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (Auckland)" },
  { value: "Pacific/Fiji", label: "Pacific/Fiji (Fiji)" },
  { value: "Pacific/Honolulu", label: "Pacific/Honolulu (Honolulu)" },
];

