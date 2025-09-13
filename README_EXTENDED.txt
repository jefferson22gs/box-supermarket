POS Supermercado - Extended (Owner profile, operators, closure, dashboard)

Files:
- index.html
- styles.css
- config.js
- app_supabase_extended.js
- supabase.sql

Deployment steps (summary):
1. Create Supabase project.
2. Run supabase.sql in SQL editor to create tables.
3. Configure Auth (email/password).
4. Fill config.js with SUPABASE_URL and SUPABASE_ANON_KEY (or use environment injection).
5. Deploy static site to Vercel (or host static files). Ensure CORS and policies are set for production.

Notes & Recommendations:
- Operator creation via signUp is used for prototyping. For secure operator management, create serverless admin endpoints using Supabase SERVICE_ROLE key (never commit service role key to public repo).
- Store logo stored as base64 in store_info; for production, use Supabase Storage and store only reference in DB.
- Cash closures stored in cash_closures table.
- Dashboard aggregates are computed client-side; for large data sets implement server-side aggregation (Supabase SQL/Functions).
