# Deployment Steps: Update get-winery-details Edge Function

Since we verified the local test cases, we need to document the deployment of the updated `get-winery-details` Edge Function to the remote Supabase environment.

> [!WARNING]
> Do not execute mutations or deployments on production project `jfsxclrdxmvftxacjuqf` without secondary confirmation or user request. These instructions are for reference during the final release process.

## Steps

1. **Prerequisites**
   - Ensure the Supabase CLI is authenticated: `supabase login`
   - Verify you have access to the project reference `jfsxclrdxmvftxacjuqf`.

2. **Deploy the Edge Function**
   Execute the following command to deploy the updated `get-winery-details` function:
   ```bash
   supabase functions deploy get-winery-details --project-ref jfsxclrdxmvftxacjuqf
   ```

3. **Verify Deployment**
   Verify the function is active and matches the expected version in the Supabase Dashboard.
