# Supabase Storage Bucket Setup

## Workspace Logos Bucket

The `workspace-logos` bucket is required for the logo upload feature in Workspace Settings.

### Setup Instructions

1. **Create the bucket via Supabase Dashboard:**
   - Go to Storage → Create Bucket
   - Name: `workspace-logos`
   - Public: **Yes** (checked)
   - File size limit: 2MB (optional, but recommended)
   - Allowed MIME types: `image/png`, `image/jpeg`, `image/webp` (optional)

2. **Set up RLS policies (if needed):**
   - The bucket should be public for read access
   - Upload access should be restricted to authenticated users
   - Example policy (via SQL Editor):
     ```sql
     -- Allow authenticated users to upload
     CREATE POLICY "Authenticated users can upload logos"
     ON storage.objects FOR INSERT
     TO authenticated
     WITH CHECK (bucket_id = 'workspace-logos');

     -- Allow public read access
     CREATE POLICY "Public can read logos"
     ON storage.objects FOR SELECT
     TO public
     USING (bucket_id = 'workspace-logos');
     ```

### Bucket Structure

Files are stored as: `{workspaceId}/{timestamp}.{ext}`

Example: `4fcdda2b-6006-44d8-a87d-6c8b3e768374/1704067200000.png`

### Notes

- The upload component uses `upsert: true` to overwrite existing files
- Files are organized by workspace ID for easy management
- Public URLs are generated automatically by Supabase Storage
