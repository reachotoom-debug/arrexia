/**
 * Profile helper functions for user profiles
 */

import { supabaseServer } from "@/lib/supabase/server";

export interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get or create a user profile
 * 
 * @param userId - The user ID from auth.users
 * @param email - The user's email (used as fallback for full_name if profile doesn't exist)
 * @returns The user profile
 */
export async function getOrCreateProfile(
  userId: string,
  email: string
): Promise<UserProfile> {
  const supabase = await supabaseServer();

  // Try to get existing profile
  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (selectError && selectError.code !== "PGRST116") {
    // PGRST116 is "not found" which is expected for new users
    console.error("[getOrCreateProfile] select error:", selectError);
  }

  // If profile exists, return it
  if (existingProfile) {
    return existingProfile;
  }

  // Profile doesn't exist, create it
  const newProfile = {
    id: userId,
    full_name: email, // Use email as initial full_name
    avatar_url: null,
  };

  const { data: createdProfile, error: insertError } = await supabase
    .from("profiles")
    .insert(newProfile)
    .select()
    .single();

  if (insertError) {
    console.error("[getOrCreateProfile] insert error:", insertError);
    // Return a fallback profile object if insert fails
    return {
      id: userId,
      full_name: email,
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  return createdProfile;
}
