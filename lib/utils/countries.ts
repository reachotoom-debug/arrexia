export type Country = {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  /** National trunk prefix stripped before prepending `dialCode` (e.g. Jordan 077… → 77…). */
  trunkPrefix?: "0";
};

// Full world countries list with flags and E.164 dialing metadata for WhatsApp normalization.
export const countries: Country[] = [
  { code: "US", name: "United States", flag: "🇺🇸", dialCode: "1" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", dialCode: "44", trunkPrefix: "0" },
  { code: "CA", name: "Canada", flag: "🇨🇦", dialCode: "1" },
  { code: "AU", name: "Australia", flag: "🇦🇺", dialCode: "61", trunkPrefix: "0" },
  { code: "DE", name: "Germany", flag: "🇩🇪", dialCode: "49", trunkPrefix: "0" },
  { code: "FR", name: "France", flag: "🇫🇷", dialCode: "33", trunkPrefix: "0" },
  { code: "IT", name: "Italy", flag: "🇮🇹", dialCode: "39", trunkPrefix: "0" },
  { code: "ES", name: "Spain", flag: "🇪🇸", dialCode: "34", trunkPrefix: "0" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", dialCode: "31", trunkPrefix: "0" },
  { code: "BE", name: "Belgium", flag: "🇧🇪", dialCode: "32", trunkPrefix: "0" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", dialCode: "41", trunkPrefix: "0" },
  { code: "AT", name: "Austria", flag: "🇦🇹", dialCode: "43", trunkPrefix: "0" },
  { code: "SE", name: "Sweden", flag: "🇸🇪", dialCode: "46", trunkPrefix: "0" },
  { code: "NO", name: "Norway", flag: "🇳🇴", dialCode: "47", trunkPrefix: "0" },
  { code: "DK", name: "Denmark", flag: "🇩🇰", dialCode: "45", trunkPrefix: "0" },
  { code: "FI", name: "Finland", flag: "🇫🇮", dialCode: "358", trunkPrefix: "0" },
  { code: "PL", name: "Poland", flag: "🇵🇱", dialCode: "48", trunkPrefix: "0" },
  { code: "IE", name: "Ireland", flag: "🇮🇪", dialCode: "353", trunkPrefix: "0" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", dialCode: "351", trunkPrefix: "0" },
  { code: "GR", name: "Greece", flag: "🇬🇷", dialCode: "30", trunkPrefix: "0" },
  { code: "CZ", name: "Czech Republic", flag: "🇨🇿", dialCode: "420", trunkPrefix: "0" },
  { code: "HU", name: "Hungary", flag: "🇭🇺", dialCode: "36", trunkPrefix: "0" },
  { code: "RO", name: "Romania", flag: "🇷🇴", dialCode: "40", trunkPrefix: "0" },
  { code: "BG", name: "Bulgaria", flag: "🇧🇬", dialCode: "359", trunkPrefix: "0" },
  { code: "HR", name: "Croatia", flag: "🇭🇷", dialCode: "385", trunkPrefix: "0" },
  { code: "SK", name: "Slovakia", flag: "🇸🇰", dialCode: "421", trunkPrefix: "0" },
  { code: "SI", name: "Slovenia", flag: "🇸🇮", dialCode: "386", trunkPrefix: "0" },
  { code: "LT", name: "Lithuania", flag: "🇱🇹", dialCode: "370", trunkPrefix: "0" },
  { code: "LV", name: "Latvia", flag: "🇱🇻", dialCode: "371", trunkPrefix: "0" },
  { code: "EE", name: "Estonia", flag: "🇪🇪", dialCode: "372", trunkPrefix: "0" },
  { code: "JP", name: "Japan", flag: "🇯🇵", dialCode: "81", trunkPrefix: "0" },
  { code: "CN", name: "China", flag: "🇨🇳", dialCode: "86", trunkPrefix: "0" },
  { code: "KR", name: "South Korea", flag: "🇰🇷", dialCode: "82", trunkPrefix: "0" },
  { code: "IN", name: "India", flag: "🇮🇳", dialCode: "91", trunkPrefix: "0" },
  { code: "SG", name: "Singapore", flag: "🇸🇬", dialCode: "65", trunkPrefix: "0" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", dialCode: "60", trunkPrefix: "0" },
  { code: "TH", name: "Thailand", flag: "🇹🇭", dialCode: "66", trunkPrefix: "0" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", dialCode: "62", trunkPrefix: "0" },
  { code: "PH", name: "Philippines", flag: "🇵🇭", dialCode: "63", trunkPrefix: "0" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳", dialCode: "84", trunkPrefix: "0" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿", dialCode: "64", trunkPrefix: "0" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", dialCode: "27", trunkPrefix: "0" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", dialCode: "20", trunkPrefix: "0" },
  { code: "MA", name: "Morocco", flag: "🇲🇦", dialCode: "212", trunkPrefix: "0" },
  { code: "KE", name: "Kenya", flag: "🇰🇪", dialCode: "254", trunkPrefix: "0" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", dialCode: "234", trunkPrefix: "0" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", dialCode: "233", trunkPrefix: "0" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", dialCode: "55", trunkPrefix: "0" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", dialCode: "52", trunkPrefix: "0" },
  { code: "AR", name: "Argentina", flag: "🇦🇷", dialCode: "54", trunkPrefix: "0" },
  { code: "CL", name: "Chile", flag: "🇨🇱", dialCode: "56", trunkPrefix: "0" },
  { code: "CO", name: "Colombia", flag: "🇨🇴", dialCode: "57", trunkPrefix: "0" },
  { code: "PE", name: "Peru", flag: "🇵🇪", dialCode: "51", trunkPrefix: "0" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", dialCode: "971", trunkPrefix: "0" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", dialCode: "966", trunkPrefix: "0" },
  { code: "IL", name: "Israel", flag: "🇮🇱", dialCode: "972", trunkPrefix: "0" },
  { code: "TR", name: "Turkey", flag: "🇹🇷", dialCode: "90", trunkPrefix: "0" },
  { code: "RU", name: "Russia", flag: "🇷🇺", dialCode: "7", trunkPrefix: "0" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦", dialCode: "380", trunkPrefix: "0" },
  { code: "JO", name: "Jordan", flag: "🇯🇴", dialCode: "962", trunkPrefix: "0" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧", dialCode: "961", trunkPrefix: "0" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼", dialCode: "965", trunkPrefix: "0" },
  { code: "QA", name: "Qatar", flag: "🇶🇦", dialCode: "974", trunkPrefix: "0" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭", dialCode: "973", trunkPrefix: "0" },
  { code: "OM", name: "Oman", flag: "🇴🇲", dialCode: "968", trunkPrefix: "0" },
];

export const getCountryByCode = (code: string) => {
  return countries.find((c) => c.code === code);
};

export const getCountryByName = (name: string) => {
  return countries.find((c) => c.name === name);
};
