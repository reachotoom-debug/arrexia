// @ts-nocheck
/**
 * Unit tests for import normalization utilities
 */

import {
  normalizeDate,
  normalizeMoney,
  normalizeStatus,
  normalizeEmail,
  normalizePhone,
} from "../normalize";

describe("normalizeDate", () => {
  it("should parse YYYY-MM-DD format", () => {
    expect(normalizeDate("2024-01-15")).toBe("2024-01-15");
    expect(normalizeDate("2024-12-31")).toBe("2024-12-31");
  });

  it("should parse M/D/YYYY format", () => {
    expect(normalizeDate("1/15/2024")).toBe("2024-01-15");
    expect(normalizeDate("12/31/2024")).toBe("2024-12-31");
  });

  it("should parse MM/DD/YYYY format", () => {
    expect(normalizeDate("01/15/2024")).toBe("2024-01-15");
    expect(normalizeDate("12/31/2024")).toBe("2024-12-31");
  });

  it("should handle edge cases", () => {
    expect(normalizeDate("2/29/2024")).toBe("2024-02-29"); // Leap year
    expect(normalizeDate("2/29/2023")).toBeNull(); // Not a leap year
    expect(normalizeDate("13/01/2024")).toBeNull(); // Invalid month
    expect(normalizeDate("01/32/2024")).toBeNull(); // Invalid day
  });

  it("should return null for invalid inputs", () => {
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate("   ")).toBeNull();
    expect(normalizeDate("invalid")).toBeNull();
    expect(normalizeDate("2024-13-01")).toBeNull();
    expect(normalizeDate("2024-01-32")).toBeNull();
  });

  it("should trim whitespace", () => {
    expect(normalizeDate("  2024-01-15  ")).toBe("2024-01-15");
    expect(normalizeDate("  1/15/2024  ")).toBe("2024-01-15");
  });
});

describe("normalizeMoney", () => {
  it("should remove commas", () => {
    expect(normalizeMoney("1,234.56")).toBe("1234.56");
    expect(normalizeMoney("1,234,567.89")).toBe("1234567.89");
  });

  it("should handle scientific notation", () => {
    expect(normalizeMoney("1.23E+2")).toBe("123");
    expect(normalizeMoney("1.23e+2")).toBe("123");
    expect(normalizeMoney("1.23E2")).toBe("123");
    expect(normalizeMoney("1.5E+3")).toBe("1500");
    expect(normalizeMoney("1.5E-2")).toBe("0.015");
  });

  it("should preserve negative signs", () => {
    expect(normalizeMoney("-123.45")).toBe("-123.45");
    expect(normalizeMoney("-1.23E+2")).toBe("-123");
  });

  it("should handle decimal numbers", () => {
    expect(normalizeMoney("123.45")).toBe("123.45");
    expect(normalizeMoney("0.99")).toBe("0.99");
    expect(normalizeMoney(".5")).toBe(".5");
  });

  it("should handle integers", () => {
    expect(normalizeMoney("123")).toBe("123");
    expect(normalizeMoney("0")).toBe("0");
  });

  it("should handle empty strings", () => {
    expect(normalizeMoney("")).toBe("");
    expect(normalizeMoney("   ")).toBe("");
  });

  it("should remove non-numeric characters", () => {
    expect(normalizeMoney("$123.45")).toBe("123.45");
    expect(normalizeMoney("USD 1,234.56")).toBe("1234.56");
  });

  it("should handle very large numbers in scientific notation", () => {
    expect(normalizeMoney("1.23E+10")).toBe("12300000000");
    expect(normalizeMoney("1.5E+6")).toBe("1500000");
  });

  it("should handle very small numbers in scientific notation", () => {
    expect(normalizeMoney("1.5E-6")).toBe("0.0000015");
    expect(normalizeMoney("1.23E-3")).toBe("0.00123");
  });
});

describe("normalizeStatus", () => {
  it("should normalize to Draft", () => {
    expect(normalizeStatus("draft")).toBe("Draft");
    expect(normalizeStatus("Draft")).toBe("Draft");
    expect(normalizeStatus("DRAFT")).toBe("Draft");
    expect(normalizeStatus("  draft  ")).toBe("Draft");
  });

  it("should normalize to Sent", () => {
    expect(normalizeStatus("sent")).toBe("Sent");
    expect(normalizeStatus("Sent")).toBe("Sent");
    expect(normalizeStatus("SENT")).toBe("Sent");
    expect(normalizeStatus("  sent  ")).toBe("Sent");
  });

  it("should normalize to Void", () => {
    expect(normalizeStatus("void")).toBe("Void");
    expect(normalizeStatus("Void")).toBe("Void");
    expect(normalizeStatus("VOID")).toBe("Void");
    expect(normalizeStatus("  void  ")).toBe("Void");
  });

  it("should reject derived statuses", () => {
    expect(normalizeStatus("paid")).toBeNull();
    expect(normalizeStatus("Paid")).toBeNull();
    expect(normalizeStatus("partially paid")).toBeNull();
    expect(normalizeStatus("Partially Paid")).toBeNull();
    expect(normalizeStatus("overdue")).toBeNull();
    expect(normalizeStatus("Overdue")).toBeNull();
  });

  it("should return null for invalid inputs", () => {
    expect(normalizeStatus("")).toBeNull();
    expect(normalizeStatus("   ")).toBeNull();
    expect(normalizeStatus("invalid")).toBeNull();
    expect(normalizeStatus("pending")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("should normalize valid emails", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
    expect(normalizeEmail("USER@EXAMPLE.COM")).toBe("user@example.com");
    expect(normalizeEmail("  User@Example.com  ")).toBe("user@example.com");
  });

  it("should return null for invalid emails", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("invalid")).toBeNull();
    expect(normalizeEmail("@example.com")).toBeNull();
    expect(normalizeEmail("user@")).toBeNull();
    expect(normalizeEmail("user@example")).toBeNull();
  });

  it("should handle edge cases", () => {
    expect(normalizeEmail("user.name@example.com")).toBe("user.name@example.com");
    expect(normalizeEmail("user+tag@example.com")).toBe("user+tag@example.com");
  });
});

describe("normalizePhone", () => {
  it("should extract digits from phone numbers", () => {
    expect(normalizePhone("123-456-7890")).toBe("1234567890");
    expect(normalizePhone("(123) 456-7890")).toBe("1234567890");
    expect(normalizePhone("123.456.7890")).toBe("1234567890");
    expect(normalizePhone("123 456 7890")).toBe("1234567890");
  });

  it("should preserve leading + for international numbers", () => {
    expect(normalizePhone("+1-123-456-7890")).toBe("+11234567890");
    expect(normalizePhone("+44 20 1234 5678")).toBe("+442012345678");
  });

  it("should handle Excel scientific notation for phone numbers", () => {
    // Excel converts large numbers like 1234567890 to 1.23456789E+09
    expect(normalizePhone("1.23456789E+09")).toBe("1234567890");
    expect(normalizePhone("1.23E+09")).toBe("1230000000");
    expect(normalizePhone("1.23E+10")).toBe("12300000000");
    expect(normalizePhone("1.23e+09")).toBe("1230000000");
    expect(normalizePhone("1.23E9")).toBe("1230000000");
    
    // Test with different decimal positions
    expect(normalizePhone("1.234E+09")).toBe("1234000000");
    expect(normalizePhone("12.345E+08")).toBe("1234500000");
    expect(normalizePhone("123.456E+07")).toBe("1234560000");
  });

  it("should handle very large phone numbers", () => {
    expect(normalizePhone("123456789012345")).toBe("123456789012345");
    expect(normalizePhone("+123456789012345")).toBe("+123456789012345");
  });

  it("should return null for empty inputs", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
  });

  it("should handle mixed formats", () => {
    expect(normalizePhone("+1 (123) 456-7890")).toBe("+11234567890");
    expect(normalizePhone("Tel: 123-456-7890")).toBe("1234567890");
  });

  it("should never return scientific notation", () => {
    const result = normalizePhone("1.23456789E+09");
    expect(result).toBe("1234567890");
    expect(result).not.toMatch(/[eE]/); // No scientific notation
  });

  it("should handle edge cases with scientific notation", () => {
    // Very large numbers that Excel might convert
    expect(normalizePhone("9.99999999E+09")).toBe("9999999990");
    expect(normalizePhone("1E+10")).toBe("10000000000");
    expect(normalizePhone("1.0E+10")).toBe("10000000000");
    
    // Test exact matches (no decimal part)
    expect(normalizePhone("1234567890E+00")).toBe("1234567890");
    expect(normalizePhone("123456789E+01")).toBe("1234567890");
  });
  
  it("should preserve leading + with scientific notation", () => {
    // This is a bit unusual, but handle it if it happens
    const result = normalizePhone("+1.23456789E+09");
    expect(result).toBe("+1234567890");
  });
});

