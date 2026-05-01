import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check caller role
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const callerIsSuperAdmin = callerRoles?.some((r) => r.role === "super_admin");
    const callerIsManager = callerRoles?.some((r) => r.role === "manager");

    if (!callerIsSuperAdmin && !callerIsManager) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = await req.json();

    if (action === "create_user") {
      const { email, full_name, password } = payload;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || "" },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ user: { id: newUser.user.id, email: newUser.user.email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_user_full") {
      const { email, full_name, password, department_id, role, is_manager, is_assignable, start_date, date_of_birth, schedule_id } = payload;
      if (!email || !password || !full_name || !department_id || !start_date || !date_of_birth) {
        return new Response(JSON.stringify({ error: "All required fields must be provided" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1. Create auth user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = newUser.user.id;

      // 2. Update profile with employment fields
      const sd = new Date(start_date);
      sd.setMonth(sd.getMonth() + 6);
      const probationEnd = sd.toISOString().split("T")[0];

      const { error: profileError } = await adminClient
        .from("profiles")
        .update({
          start_date,
          date_of_birth,
          accrual_start_date: start_date,
          schedule_id: schedule_id || null,
          probation_end_date: probationEnd,
        })
        .eq("id", userId);

      if (profileError) {
        console.error("Profile update error:", profileError.message);
      }

      // 3. Set role (handle_new_user trigger already creates 'employee' role)
      if (role && role !== "employee") {
        // Replace the default employee role with the selected one
        await adminClient.from("user_roles").delete().eq("user_id", userId).eq("role", "employee");
        const { error: roleError } = await adminClient.from("user_roles").insert({ user_id: userId, role });
        if (roleError) console.error("Role insert error:", roleError.message);
      }

      // 4. Add to department
      const { error: deptError } = await adminClient.from("department_members").insert({
        department_id,
        user_id: userId,
        is_manager: !!is_manager,
        is_assignable: is_assignable !== false,
      });
      if (deptError) console.error("Dept member error:", deptError.message);

      return new Response(JSON.stringify({ user: { id: userId, email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_user") {
      const { user_id, email, full_name } = payload;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only super_admin or manager can edit users
      if (!callerIsSuperAdmin && !callerIsManager) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Managers cannot edit Owners
      if (!callerIsSuperAdmin) {
        const { data: targetRoles } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", user_id);
        if (targetRoles?.some((r) => r.role === "super_admin")) {
          return new Response(JSON.stringify({ error: "Only an Owner can edit another Owner" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const authUpdates: Record<string, unknown> = {};
      if (email) authUpdates.email = email;
      if (full_name !== undefined) authUpdates.user_metadata = { full_name };

      if (Object.keys(authUpdates).length > 0) {
        const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(user_id, authUpdates);
        if (updateAuthError) {
          return new Response(JSON.stringify({ error: updateAuthError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const profileUpdates: Record<string, unknown> = {};
      if (email) profileUpdates.email = email;
      if (full_name !== undefined) profileUpdates.full_name = full_name;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await adminClient
          .from("profiles")
          .update(profileUpdates)
          .eq("id", user_id);
        if (profileError) {
          return new Response(JSON.stringify({ error: profileError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const { user_id, new_password } = payload;
      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: "user_id and new_password are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!callerIsSuperAdmin && !callerIsManager) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Managers cannot reset Owner passwords
      if (!callerIsSuperAdmin) {
        const { data: targetRoles } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", user_id);
        if (targetRoles?.some((r) => r.role === "super_admin")) {
          return new Response(JSON.stringify({ error: "Only an Owner can reset an Owner's password" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      const { error: resetError } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password });
      if (resetError) {
        return new Response(JSON.stringify({ error: resetError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "deactivate_user") {
      const { user_id, is_active } = payload;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Prevent self-deactivation
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "You cannot deactivate yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check target role - can't deactivate super_admin unless caller is super_admin
      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id);
      const targetIsSuperAdmin = targetRoles?.some((r) => r.role === "super_admin");

      if (targetIsSuperAdmin && !callerIsSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only an Owner can deactivate another Owner" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update profile is_active
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ is_active: !!is_active })
        .eq("id", user_id);

      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Also ban/unban the auth user so they can't log in when deactivated
      const { error: authError2 } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: is_active ? "none" : "876600h", // ~100 years ban when deactivating
      });

      if (authError2) {
        return new Response(JSON.stringify({ error: authError2.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      const { user_id } = payload;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!callerIsSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only an Owner can permanently delete users" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id);

      const targetIsSuperAdmin = targetRoles?.some((r) => r.role === "super_admin");

      if (targetIsSuperAdmin && !callerIsSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only an Owner can remove another Owner" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "You cannot remove yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_leave_profile") {
      const { user_id, start_date, accrual_start_date, schedule_id, date_of_birth } = payload;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const profileUpdates: Record<string, unknown> = {};
      if (start_date !== undefined) profileUpdates.start_date = start_date;
      if (accrual_start_date !== undefined) profileUpdates.accrual_start_date = accrual_start_date;
      if (schedule_id !== undefined) profileUpdates.schedule_id = schedule_id === "default" ? null : schedule_id;
      if (date_of_birth !== undefined) profileUpdates.date_of_birth = date_of_birth;

      // Compute probation_end_date if start_date is set
      if (start_date) {
        const sd = new Date(start_date);
        sd.setMonth(sd.getMonth() + 6);
        profileUpdates.probation_end_date = sd.toISOString().split("T")[0];
      }

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await adminClient
          .from("profiles")
          .update(profileUpdates)
          .eq("id", user_id);
        if (profileError) {
          return new Response(JSON.stringify({ error: profileError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
