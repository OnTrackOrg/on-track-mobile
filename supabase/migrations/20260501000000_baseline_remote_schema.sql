


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."are_users_friends"("left_user_id" "uuid", "right_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select left_user_id is not null
    and right_user_id is not null
    and left_user_id <> right_user_id
    and exists (
      select 1
      from public.friendships friendships
      where friendships.status = 'accepted'
        and (
          (
            friendships.requester_user_id = left_user_id
            and friendships.addressee_user_id = right_user_id
          )
          or (
            friendships.requester_user_id = right_user_id
            and friendships.addressee_user_id = left_user_id
          )
        )
    );
$$;


ALTER FUNCTION "public"."are_users_friends"("left_user_id" "uuid", "right_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_profile_by_username"("search_username" "text") RETURNS TABLE("id" "uuid", "display_name" "text", "username" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select profiles.id, profiles.display_name, profiles.username, profiles.created_at
  from public.profiles profiles
  where profiles.username = lower(trim(search_username))
  limit 1;
$$;


ALTER FUNCTION "public"."find_profile_by_username"("search_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "addressee_user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_check" CHECK (("requester_user_id" <> "addressee_user_id")),
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goal_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_memberships_role_check" CHECK (("role" = ANY (ARRAY['editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."goal_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "target" "text",
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "goals_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'shared'::"text"])))
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "completed_by_user_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_day" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "custom_type" "text",
    "custom_target" integer,
    "position" integer DEFAULT 0 NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tasks_check" CHECK (((("frequency" = 'custom'::"text") AND ("custom_type" IS NOT NULL) AND ("custom_target" IS NOT NULL)) OR (("frequency" <> 'custom'::"text") AND ("custom_type" IS NULL) AND ("custom_target" IS NULL)))),
    CONSTRAINT "tasks_custom_target_check" CHECK ((("custom_target" IS NULL) OR ("custom_target" > 0))),
    CONSTRAINT "tasks_custom_type_check" CHECK (("custom_type" = ANY (ARRAY['weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "tasks_frequency_check" CHECK (("frequency" = ANY (ARRAY['once'::"text", 'daily'::"text", 'weekly'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_memberships"
    ADD CONSTRAINT "goal_memberships_goal_id_user_id_key" UNIQUE ("goal_id", "user_id");



ALTER TABLE ONLY "public"."goal_memberships"
    ADD CONSTRAINT "goal_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_task_id_completed_by_user_id_completed_day_key" UNIQUE ("task_id", "completed_by_user_id", "completed_day");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



CREATE INDEX "friendships_addressee_status_idx" ON "public"."friendships" USING "btree" ("addressee_user_id", "status");



CREATE INDEX "friendships_addressee_user_id_idx" ON "public"."friendships" USING "btree" ("addressee_user_id");



CREATE UNIQUE INDEX "friendships_pair_unique_idx" ON "public"."friendships" USING "btree" (LEAST("requester_user_id", "addressee_user_id"), GREATEST("requester_user_id", "addressee_user_id"));



CREATE INDEX "friendships_requester_status_idx" ON "public"."friendships" USING "btree" ("requester_user_id", "status");



CREATE INDEX "friendships_requester_user_id_idx" ON "public"."friendships" USING "btree" ("requester_user_id");



CREATE UNIQUE INDEX "friendships_unique_pair" ON "public"."friendships" USING "btree" (LEAST("requester_user_id", "addressee_user_id"), GREATEST("requester_user_id", "addressee_user_id"));



CREATE INDEX "goal_memberships_goal_id_idx" ON "public"."goal_memberships" USING "btree" ("goal_id");



CREATE INDEX "goal_memberships_user_id_idx" ON "public"."goal_memberships" USING "btree" ("user_id");



CREATE INDEX "goals_owner_completed_at_idx" ON "public"."goals" USING "btree" ("owner_user_id", "completed_at");



CREATE INDEX "goals_owner_user_id_idx" ON "public"."goals" USING "btree" ("owner_user_id");



CREATE INDEX "task_completions_completed_by_user_id_idx" ON "public"."task_completions" USING "btree" ("completed_by_user_id");



CREATE INDEX "task_completions_completed_day_idx" ON "public"."task_completions" USING "btree" ("completed_day");



CREATE INDEX "task_completions_task_id_idx" ON "public"."task_completions" USING "btree" ("task_id");



CREATE INDEX "tasks_goal_id_idx" ON "public"."tasks" USING "btree" ("goal_id");



CREATE OR REPLACE TRIGGER "friendships_touch_updated_at" BEFORE UPDATE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_addressee_user_id_fkey" FOREIGN KEY ("addressee_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_memberships"
    ADD CONSTRAINT "goal_memberships_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_memberships"
    ADD CONSTRAINT "goal_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE CASCADE;



CREATE POLICY "Completions are visible to owners and accepted friends" ON "public"."task_completions" FOR SELECT TO "authenticated" USING ((("completed_by_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."tasks" "tasks"
     JOIN "public"."goals" "goals" ON (("goals"."id" = "tasks"."goal_id")))
  WHERE (("tasks"."id" = "task_completions"."task_id") AND ("task_completions"."completed_by_user_id" = "goals"."owner_user_id") AND "public"."are_users_friends"("auth"."uid"(), "goals"."owner_user_id"))))));



CREATE POLICY "Friendships are visible to participants" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "requester_user_id") OR ("auth"."uid"() = "addressee_user_id")));



CREATE POLICY "Goals are visible to owners and accepted friends" ON "public"."goals" FOR SELECT TO "authenticated" USING ((("owner_user_id" = "auth"."uid"()) OR "public"."are_users_friends"("auth"."uid"(), "owner_user_id")));



CREATE POLICY "Recipients can accept or deny requests" ON "public"."friendships" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "addressee_user_id") AND ("status" = 'pending'::"text"))) WITH CHECK ((("auth"."uid"() = "addressee_user_id") AND ("status" = ANY (ARRAY['accepted'::"text", 'denied'::"text"]))));



CREATE POLICY "Tasks are visible to owners and accepted friends" ON "public"."tasks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."goals" "goals"
  WHERE (("goals"."id" = "tasks"."goal_id") AND (("goals"."owner_user_id" = "auth"."uid"()) OR "public"."are_users_friends"("auth"."uid"(), "goals"."owner_user_id"))))));



CREATE POLICY "Users can create their own friend requests" ON "public"."friendships" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "requester_user_id") AND ("requester_user_id" <> "addressee_user_id") AND ("status" = 'pending'::"text")));



CREATE POLICY "Users can delete own profile" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own and connected profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "id") OR (EXISTS ( SELECT 1
   FROM "public"."friendships" "friendships"
  WHERE (("friendships"."status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])) AND ((("friendships"."requester_user_id" = "auth"."uid"()) AND ("friendships"."addressee_user_id" = "profiles"."id")) OR (("friendships"."addressee_user_id" = "auth"."uid"()) AND ("friendships"."requester_user_id" = "profiles"."id"))))))));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goal_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owners and editors can create tasks" ON "public"."tasks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."goals" "g"
     LEFT JOIN "public"."goal_memberships" "gm" ON ((("gm"."goal_id" = "g"."id") AND ("gm"."user_id" = "auth"."uid"()))))
  WHERE (("g"."id" = "tasks"."goal_id") AND (("g"."owner_user_id" = "auth"."uid"()) OR ("gm"."role" = 'editor'::"text"))))));



CREATE POLICY "owners and editors can delete tasks" ON "public"."tasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."goals" "g"
     LEFT JOIN "public"."goal_memberships" "gm" ON ((("gm"."goal_id" = "g"."id") AND ("gm"."user_id" = "auth"."uid"()))))
  WHERE (("g"."id" = "tasks"."goal_id") AND (("g"."owner_user_id" = "auth"."uid"()) OR ("gm"."role" = 'editor'::"text"))))));



CREATE POLICY "owners and editors can update tasks" ON "public"."tasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."goals" "g"
     LEFT JOIN "public"."goal_memberships" "gm" ON ((("gm"."goal_id" = "g"."id") AND ("gm"."user_id" = "auth"."uid"()))))
  WHERE (("g"."id" = "tasks"."goal_id") AND (("g"."owner_user_id" = "auth"."uid"()) OR ("gm"."role" = 'editor'::"text"))))));



CREATE POLICY "owners can delete goals" ON "public"."goals" FOR DELETE USING (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "owners can update goals" ON "public"."goals" FOR UPDATE USING (("auth"."uid"() = "owner_user_id")) WITH CHECK (("auth"."uid"() = "owner_user_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can create friendship requests" ON "public"."friendships" FOR INSERT WITH CHECK (("auth"."uid"() = "requester_user_id"));



CREATE POLICY "users can create own completions" ON "public"."task_completions" FOR INSERT WITH CHECK ((("auth"."uid"() = "completed_by_user_id") AND (EXISTS ( SELECT 1
   FROM ("public"."tasks" "t"
     JOIN "public"."goals" "g" ON (("g"."id" = "t"."goal_id")))
  WHERE (("t"."id" = "task_completions"."task_id") AND (("g"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."goal_memberships" "gm"
          WHERE (("gm"."goal_id" = "g"."id") AND ("gm"."user_id" = "auth"."uid"()))))))))));



CREATE POLICY "users can create own goals" ON "public"."goals" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "users can delete own completions" ON "public"."task_completions" FOR DELETE USING (("auth"."uid"() = "completed_by_user_id"));



CREATE POLICY "users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users can update their friendship rows" ON "public"."friendships" FOR UPDATE USING ((("auth"."uid"() = "requester_user_id") OR ("auth"."uid"() = "addressee_user_id")));



CREATE POLICY "users can view completions on accessible goals" ON "public"."task_completions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tasks" "t"
     JOIN "public"."goals" "g" ON (("g"."id" = "t"."goal_id")))
  WHERE (("t"."id" = "task_completions"."task_id") AND (("g"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."goal_memberships" "gm"
          WHERE (("gm"."goal_id" = "g"."id") AND ("gm"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "users can view owned or shared goals" ON "public"."goals" FOR SELECT USING ((("auth"."uid"() = "owner_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."goal_memberships" "gm"
  WHERE (("gm"."goal_id" = "goals"."id") AND ("gm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "users can view tasks on accessible goals" ON "public"."tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "tasks"."goal_id") AND (("g"."owner_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."goal_memberships" "gm"
          WHERE (("gm"."goal_id" = "g"."id") AND ("gm"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "users can view their friendships" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "requester_user_id") OR ("auth"."uid"() = "addressee_user_id")));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."are_users_friends"("left_user_id" "uuid", "right_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."are_users_friends"("left_user_id" "uuid", "right_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."are_users_friends"("left_user_id" "uuid", "right_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_profile_by_username"("search_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_profile_by_username"("search_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_profile_by_username"("search_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."goal_memberships" TO "anon";
GRANT ALL ON TABLE "public"."goal_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."task_completions" TO "anon";
GRANT ALL ON TABLE "public"."task_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."task_completions" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







