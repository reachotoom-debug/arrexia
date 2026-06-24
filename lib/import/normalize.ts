/**
 * Normalization utilities for CSV/TSV import operations.
 * Handles Excel quirks like scientific notation, date formats, etc.
 */

/**
 * Normalize date string to ISO format (YYYY-MM-DD) or return null
 * Accepts: YYYY-MM-DD, M/D/YYYY, MM/DD/YYYY
 */
export function normalizeDate(input: string): string | null {
  if (!input) return null;
  
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try M/D/YYYY or MM/DD/YYYY format
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = trimmed.match(mmddyyyy);
  if (match) {
    const [, month, day, year] = match;
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    
    // Validate month and day ranges
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      // Additional validation: check if day is valid for the month
      const dateObj = new Date(y, m - 1, d);
      if (
        dateObj.getFullYear() === y &&
        dateObj.getMonth() === m - 1 &&
        dateObj.getDate() === d
      ) {
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }

  // Try YYYY-MM-DD format (already correct)
  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (trimmed.match(yyyymmdd)) {
    // Validate the date
    const dateObj = new Date(trimmed);
    if (!isNaN(dateObj.getTime())) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Normalize money/numeric string to decimal format
 * - Removes commas
 * - Handles scientific notation (e.g., "1.23E+2" -> "123")
 * - Returns normalized decimal string (no commas, no scientific notation)
 * - Preserves negative signs
 */
export function normalizeMoney(input: string): string {
  if (!input) return "";
  
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Remove commas
  let normalized = trimmed.replace(/,/g, "");

  // Handle scientific notation (e.g., "1.23E+2", "1.23e-2", "1.23E2")
  const scientificNotation = /^([+-]?\d*\.?\d+)[eE]([+-]?\d+)$/;
  const sciMatch = normalized.match(scientificNotation);
  
  if (sciMatch) {
    const [, base, exponent] = sciMatch;
    const baseNum = parseFloat(base);
    const expNum = parseInt(exponent, 10);
    
    if (!isNaN(baseNum) && !isNaN(expNum)) {
      const result = baseNum * Math.pow(10, expNum);
      // Convert to string without scientific notation
      // Use toFixed to avoid scientific notation for large numbers
      if (Math.abs(result) >= 1e6 || (Math.abs(result) < 1e-6 && result !== 0)) {
        // For very large or very small numbers, use toFixed
        const fixed = result.toFixed(Math.max(0, -expNum));
        normalized = fixed.replace(/\.?0+$/, ""); // Remove trailing zeros
      } else {
        normalized = result.toString();
      }
    }
  }

  // Remove any remaining non-numeric characters except decimal point and minus sign
  // But preserve the structure for decimal numbers
  normalized = normalized.replace(/[^\d.-]/g, "");

  return normalized;
}

/**
 * Normalize status string to canonical format
 * Returns: "Draft" | "Sent" | "Void" | null
 * Case-insensitive matching
 * Rejects derived statuses (Paid, Partially Paid, Overdue, etc.)
 */
export function normalizeStatus(input: string): "Draft" | "Sent" | "Void" | null {
  if (!input) return null;
  
  const normalized = input.trim().toLowerCase();
  
  // Only accept base statuses
  if (normalized === "draft") return "Draft";
  if (normalized === "sent") return "Sent";
  if (normalized === "void") return "Void";
  
  // Reject derived statuses
  return null;
}

/**
 * Normalize email address
 * - Trims whitespace
 * - Converts to lowercase
 * - Returns null if invalid format
 */
export function normalizeEmail(input: string): string | null {
  if (!input) return null;
  
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Normalize phone number
 * - Removes all non-digit characters except leading +
 * - Preserves full digits (never converts to scientific notation)
 * - Handles Excel scientific notation for phone numbers (e.g., "1.23E+10" -> full digits)
 * - Returns normalized string with digits only (or +digits for international)
 */
export function normalizePhone(input: string): string | null {
  if (!input) return null;
  
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Handle scientific notation first (Excel converts large numbers to scientific)
  // Phone numbers can be very large integers (e.g., 1234567890)
  let normalized = trimmed;

  // Check for scientific notation (Excel converts large phone numbers to scientific)
  // Example: 1234567890 becomes 1.23456789E+09
  const scientificNotation = /^([+-]?\d*\.?\d+)[eE]([+-]?\d+)$/;
  const sciMatch = normalized.match(scientificNotation);
  
  if (sciMatch) {
    const [, base, exponent] = sciMatch;
    const baseNum = parseFloat(base);
    const expNum = parseInt(exponent, 10);
    
    if (!isNaN(baseNum) && !isNaN(expNum) && expNum >= 0) {
      // For phone numbers, we need the full integer representation
      // Manual conversion to avoid JavaScript's scientific notation
      const baseStr = baseNum.toString();
      const decimalIndex = baseStr.indexOf('.');
      
      if (decimalIndex >= 0) {
        // Has decimal point: remove it and adjust
        const integerPart = baseStr.substring(0, decimalIndex);
        const decimalPart = baseStr.substring(decimalIndex + 1);
        const totalDigits = integerPart.length + decimalPart.length;
        const zerosNeeded = expNum - decimalPart.length;
        
        if (zerosNeeded >= 0) {
          // Add zeros to the end
          normalized = integerPart + decimalPart + '0'.repeat(zerosNeeded);
        } else {
          // Truncate decimal part
          normalized = integerPart + decimalPart.substring(0, expNum);
        }
      } else {
        // No decimal point: just add zeros
        normalized = baseStr + '0'.repeat(expNum);
      }
      
      // Remove any remaining non-digit characters (shouldn't be any, but safety check)
      normalized = normalized.replace(/[^\d]/g, '');
    } else {
      // Invalid or negative exponent: try standard conversion
      const result = baseNum * Math.pow(10, expNum);
      if (result >= 0 && Number.isFinite(result)) {
        // Use toFixed to avoid scientific notation, then remove decimal point
        normalized = result.toFixed(Math.max(0, -expNum)).replace(/\.0+$/, '').replace(/\./, '');
      } else {
        normalized = '';
      }
    }
  }

  // Extract digits and optional leading +
  // Preserve leading + for international numbers
  const hasPlus = normalized.startsWith("+");
  const digits = normalized.replace(/[^\d]/g, "");
  
  if (!digits) return null;
  
  // Return with + prefix if original had it
  return hasPlus ? `+${digits}` : digits;
}

