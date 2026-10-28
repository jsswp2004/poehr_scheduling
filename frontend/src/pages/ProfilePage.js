import { useCallback, useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  Avatar,
  FormControl,
  InputLabel,
  Select as MUISelect,
  MenuItem,
  CircularProgress,
  Paper,
  Chip,
  Container,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import BackButton from "../components/BackButton";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import SearchIcon from "@mui/icons-material/Search";
import LockResetIcon from "@mui/icons-material/LockReset";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import { jwtDecode } from "jwt-decode";
import { toast } from "../components/SimpleToast";
import { useNavigate } from "react-router-dom";
import CreatableSelect from "react-select/creatable";
import { notifyProfileUpdated } from "../utils/events";
import { API_BASE_URL } from "../config/api";
import UserFacilitiesPanel from "../components/profile/UserFacilitiesPanel";
import RemoveUserDialog from "../components/profile/RemoveUserDialog";

function ProfilePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [removeTarget, setRemoveTarget] = useState(null);

  const navigate = useNavigate();
  const token = localStorage.getItem("access_token");
  const fileInputRef = useRef();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState("details");
  const [selfUser, setSelfUser] = useState(null);
  const [formData, setFormData] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    organization: "",
    role: "",
  });

  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [organizations, setOrganizations] = useState([]);

  // Rights / permissions management (Security Settings, admin & system_admin only)
  const [rightsLoading, setRightsLoading] = useState(false);
  const [rightsCatalog, setRightsCatalog] = useState([]);
  const [roleDefaultRights, setRoleDefaultRights] = useState([]);
  const [serverOverrides, setServerOverrides] = useState({});
  const [rightsChecked, setRightsChecked] = useState({});
  const [rightsBaseline, setRightsBaseline] = useState({});

  // Publish the pinned block height so sticky table headers sit just under it
  const pinRef = useCallback((node) => {
    if (!node) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--profile-sticky-h",
        `${node.offsetHeight}px`
      );
    publish();
    if (typeof ResizeObserver !== "undefined")
      new ResizeObserver(publish).observe(node);
  }, []);

  useEffect(() => {
    if (!token) return;

    const decoded = jwtDecode(token);
    const userId = decoded.user_id;
    axios
      .get(`${API_BASE_URL}/api/users/${userId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (!res.data) {
          toast.error("No user profile found.");
          return;
        }
        console.log("🔍 API Response:", res.data);
        console.log("🔍 Phone Number from API:", res.data.phone_number);
        setUser(res.data);
        setSelfUser(res.data);
        const newFormData = {
          username: res.data.username,
          first_name: res.data.first_name,
          last_name: res.data.last_name,
          email: res.data.email,
          phone_number: res.data.phone_number || "",
          organization: res.data.organization,
          role: res.data.role,
        };
        console.log("🔍 New FormData:", newFormData);
        setFormData(newFormData);
      })
      .catch((err) => {
        console.error("Failed to load user", err);
        toast.error("Could not load profile");
      })
      .finally(() => setLoading(false));

    // Fetch organizations for dropdown
    axios
      .get(`${API_BASE_URL}/api/users/organizations/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setOrganizations(res.data))
      .catch(() => setOrganizations([]));
  }, [token]);

  // Debug: Log whenever formData changes
  useEffect(() => {
    console.log("🔄 FormData State Updated:", formData);
    console.log("🔄 Phone Number in State:", formData.phone_number);
    console.log("🔄 Username in State:", formData.username);
  }, [formData]);
  const handleSearch = async () => {
    try {
      console.log("🔍 Performing fresh user search...");

      // Fetch the current user's organization
      const orgId =
        user && user.organization && typeof user.organization === "object"
          ? user.organization.id
          : user.organization;

      const res = await axios.get(
        `${API_BASE_URL}/api/users/search/?q=${searchQuery}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache', // Ensure fresh data
            'Pragma': 'no-cache'
          },
        }
      );

      console.log(`📊 Search returned ${res.data.length} users`);

      // System admins can see all users across organizations
      const isSystemAdmin = loggedInUserRole === "system_admin";

      // Filter results based on role and organization
      const filtered = res.data.filter((u) => {
        // Always exclude patients from search results
        if (u.role === "patient") return false;

        // For system admins, include all non-patient users regardless of organization
        if (isSystemAdmin) return true;

        // For other roles, only include users from the same organization
        if (!u.organization || !orgId) return false;

        // Handle organization as object or ID
        if (typeof u.organization === "object")
          return String(u.organization.id) === String(orgId);
        return String(u.organization) === String(orgId);
      });

      setSearchResults(filtered);
      if (filtered.length > 0) setTab("results");
      if (filtered.length === 0) {
        toast.info(
          isSystemAdmin
            ? "No matching users found."
            : "No matching users found in your organization."
        );
      }
    } catch (err) {
      toast.error("Search failed.");
    }
  };
  const handleRemoved = async (result) => {
    setRemoveTarget(null);
    toast.success(
      result.result === "deleted"
        ? `${result.name} was deleted.`
        : `${result.name} was removed and deactivated. Their orders and notes keep their name.`
    );
    if (searchQuery.trim()) await handleSearch();
  };

  const handleRestore = async (person) => {
    try {
      await axios.post(`${API_BASE_URL}/api/users/${person.id}/restore/`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`${person.first_name} ${person.last_name} was restored. Set their facilities and rights again.`);
      if (searchQuery.trim()) await handleSearch();
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not restore this person.");
    }
  };

  const loadUserRights = async () => {
    if (!user?.id || !token) return;
    setRightsLoading(true);
    try {
      const [catalogRes, rightsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/users/rights-catalog/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE_URL}/api/users/${user.id}/rights/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const catalog = catalogRes.data.categories || [];
      setRightsCatalog(catalog);
      setRoleDefaultRights(rightsRes.data.role_default_rights || []);
      setServerOverrides(rightsRes.data.overrides || {});

      const effectiveSet = new Set(rightsRes.data.effective_rights || []);
      const initialChecked = {};
      catalog.forEach((cat) => {
        cat.rights.forEach((r) => {
          initialChecked[r.code] = effectiveSet.has(r.code);
        });
      });
      setRightsChecked(initialChecked);
      setRightsBaseline(initialChecked);
    } catch (err) {
      console.error("Failed to load user rights", err);
      toast.error(
        err.response?.status === 403
          ? "You don't have permission to manage rights for this user."
          : "Failed to load rights."
      );
      setRightsCatalog([]);
    } finally {
      setRightsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "rights") {
      loadUserRights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id]);

  const handleSaveRights = async () => {
    if (!user?.id) return;

    // Only send an override for a right whose desired state actually
    // differs from what the server currently has -- checked matching the
    // role default means "no override" (null clears any existing one).
    const overridesPayload = {};
    rightsCatalog.forEach((cat) => {
      cat.rights.forEach((r) => {
        const code = r.code;
        const isRoleDefault = roleDefaultRights.includes(code);
        const desiredChecked = !!rightsChecked[code];
        const newOverrideValue =
          desiredChecked === isRoleDefault ? null : desiredChecked;
        const hadOverride = Object.prototype.hasOwnProperty.call(
          serverOverrides,
          code
        );
        const currentOverrideValue = hadOverride ? serverOverrides[code] : null;
        if (newOverrideValue !== currentOverrideValue) {
          overridesPayload[code] = newOverrideValue;
        }
      });
    });

    if (Object.keys(overridesPayload).length === 0) {
      toast.info("No changes to save.");
      return;
    }

    try {
      const res = await axios.put(
        `${API_BASE_URL}/api/users/${user.id}/rights/`,
        { overrides: overridesPayload },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRoleDefaultRights(res.data.role_default_rights || []);
      setServerOverrides(res.data.overrides || {});
      const effectiveSet = new Set(res.data.effective_rights || []);
      const updatedChecked = {};
      rightsCatalog.forEach((cat) => {
        cat.rights.forEach((r) => {
          updatedChecked[r.code] = effectiveSet.has(r.code);
        });
      });
      setRightsChecked(updatedChecked);
      setRightsBaseline(updatedChecked);
      toast.success(
        `Rights updated for ${user.first_name} ${user.last_name}.`
      );
    } catch (err) {
      console.error("Failed to save rights", err);
      if (err.response?.status === 403) {
        toast.error(
          "You don't have permission to change rights for this user."
        );
      } else if (err.response?.status === 400) {
        toast.error(err.response.data?.error || "Invalid rights update.");
      } else {
        toast.error("Failed to save rights.");
      }
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };
  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormData({
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone_number: user.phone_number || "",
      organization: user.organization,
      role: user.role,
    });
  };
  const handleSave = async () => {
    try {
      const response = await axios.patch(
        `${API_BASE_URL}/api/users/${user.id}/`,
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setUser(response.data);
      setIsEditing(false);

      // Notify navbar to refresh with updated data
      notifyProfileUpdated();

      toast.success("Profile updated!");
    } catch (error) {
      console.error("Failed to update profile", error);
      toast.error("Update failed.");
    }
  };
  const handlePasswordChange = async () => {
    try {
      const decoded = jwtDecode(token);
      const loggedInUserId = decoded.user_id;
      const loggedInUserRole = decoded.role;

      // Check if admin is changing another user's password
      const isAdminChangingOtherUser =
        (loggedInUserRole === "admin" || loggedInUserRole === "system_admin") &&
        user.id !== loggedInUserId;

      if (isAdminChangingOtherUser) {
        // Use admin password change endpoint
        const adminPasswordData = {
          target_user_id: user.id,
          admin_password: passwordData.current_password,
          new_password: passwordData.new_password,
          confirm_password: passwordData.confirm_password,
        };

        await axios.post(
          `${API_BASE_URL}/api/users/admin-change-password/`,
          adminPasswordData,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      } else {
        // Use regular password change endpoint
        await axios.post(
          `${API_BASE_URL}/api/users/change-password/`,
          passwordData,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }

      toast.success("Password changed successfully");
      setPasswordData({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to change password");
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadFormData = new FormData();
    uploadFormData.append("profile_picture", file);
    setUploading(true);

    try {
      const res = await axios.patch(
        `${API_BASE_URL}/api/users/${user.id}/`,
        uploadFormData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setUser(res.data);

      // Notify navbar to refresh with updated profile picture
      notifyProfileUpdated();

      toast.success("Profile picture updated!");
      fileInputRef.current.value = "";
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload profile picture");
    } finally {
      setUploading(false);
    }
  }; // Get logged-in user's role
  const loggedInUserRole = token ? jwtDecode(token).role : null;

  if (loading) {
    return (
      <Box sx={{ textAlign: "center", mb: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user)
    return (
      <Typography color="error" align="center">
        User not found.
      </Typography>
    );

  const loggedInUserId = jwtDecode(token).user_id;
  const isAdmin =
    loggedInUserRole === "admin" || loggedInUserRole === "system_admin";
  const isAdminChangingOtherUser = isAdmin && user.id !== loggedInUserId;
  const viewingOther = !!selfUser && user.id !== selfUser.id;
  const BORDER = "divider";
  const STICKY_TOP = "calc(64px + var(--profile-sticky-h, 190px))";
  const orgIdOf = (o) => (o && typeof o === "object" ? o.id : o);
  const orgNameOf = (u) => {
    if (!u) return "";
    if (u.organization && typeof u.organization === "object")
      return u.organization.name || "";
    if (u.organization_name) return u.organization_name;
    const match = organizations.find(
      (o) => String(o.id) === String(u.organization)
    );
    return match ? match.name : "";
  };
  const isDirty =
    formData.username !== (user.username || "") ||
    formData.first_name !== (user.first_name || "") ||
    formData.last_name !== (user.last_name || "") ||
    formData.email !== (user.email || "") ||
    (formData.phone_number || "") !== (user.phone_number || "") ||
    String(orgIdOf(formData.organization) ?? "") !==
      String(orgIdOf(user.organization) ?? "") ||
    formData.role !== user.role;
  const changedRightCodes = Object.keys(rightsChecked).filter(
    (code) => !!rightsChecked[code] !== !!rightsBaseline[code]
  );
  const totalRights = rightsCatalog.reduce((n, c) => n + c.rights.length, 0);
  const rightsOn = Object.values(rightsChecked).filter(Boolean).length;
  const passwordReady =
    !!passwordData.current_password &&
    !!passwordData.new_password &&
    passwordData.new_password === passwordData.confirm_password;
  const passwordMismatch =
    !!passwordData.confirm_password &&
    passwordData.new_password !== passwordData.confirm_password;

  const profileTabs = [
    { key: "details", label: "Details" },
    { key: "password", label: "Password" },
    ...(isAdmin ? [{ key: "rights", label: "Rights" }] : []),
    ...(searchResults.length > 0
      ? [{ key: "results", label: "Search results", count: searchResults.length }]
      : []),
  ];
  const activeTab = profileTabs.some((t) => t.key === tab) ? tab : "details";

  const selectPerson = (result) => {
    setUser(result);
    setFormData({
      username: result.username,
      first_name: result.first_name,
      last_name: result.last_name,
      email: result.email,
      phone_number: result.phone_number || "",
      organization: result.organization,
      role: result.role,
    });
    setIsEditing(false);
    setPasswordData({ current_password: "", new_password: "", confirm_password: "" });
    setTab("details");
  };

  const backToMine = () => {
    if (selfUser) selectPerson(selfUser);
  };

  const readOnlyFieldSx = {
    "& .MuiOutlinedInput-root": { borderRadius: 2 },
  };

  const textField = (label, name, extra = {}) => (
    <TextField
      label={label}
      name={name}
      value={formData[name] || ""}
      onChange={handleChange}
      fullWidth
      size="small"
      disabled={!isEditing}
      variant="outlined"
      sx={readOnlyFieldSx}
      {...extra}
    />
  );

  const avatarSrc = user.profile_picture
    ? user.profile_picture.startsWith("http")
      ? user.profile_picture
      : `${API_BASE_URL}${user.profile_picture}`
    : undefined;

  return (
    <Container maxWidth={false} sx={{ mt: 0, mb: 3, px: { xs: 2, md: 4 } }}>
      {/* Pinned title, search, tabs and toolbar (stays put while the body scrolls) */}
      <Box
        ref={pinRef}
        sx={{
          position: "sticky",
          top: 64,
          zIndex: 1000,
          bgcolor: "background.paper",
          pt: "18px",
          mt: "-18px",
          pb: 0.5,
          borderBottom: "1px solid",
          borderColor: BORDER,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
            Profile
          </Typography>
          {user.role && (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={String(user.role).replace("_", " ")}
              sx={{ textTransform: "capitalize" }}
            />
          )}
          {orgNameOf(user) && (
            <Chip size="small" variant="outlined" label={orgNameOf(user)} />
          )}
          {user.is_active === false && (
            <Chip size="small" color="error" label="Removed" />
          )}
          {viewingOther && (
            <Chip
              size="small"
              color="warning"
              label={`Viewing ${user.first_name} ${user.last_name}`}
            />
          )}
          <Box sx={{ flex: 1 }} />
          <BackButton sx={{ mb: 0, py: 0.75 }} />
        </Box>
        <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12, mt: -0.25 }}>
          {viewingOther
            ? "You are looking at someone else's profile"
            : "Your details, password and access"}
        </Typography>

        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", pt: 1 }}
        >
          <TextField
            size="small"
            variant="outlined"
            placeholder="Search people by name, email or username"
            inputProps={{ "aria-label": "Search profiles" }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ width: { xs: "100%", sm: 320 } }}
          />
          <Button
            type="submit"
            size="small"
            variant="contained"
            startIcon={<SearchIcon />}
          >
            Search
          </Button>
          <Box sx={{ flex: 1 }} />
          {viewingOther && (
            <Button size="small" variant="outlined" onClick={backToMine}>
              Back to my profile
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={() => navigate("/create-profile")}
          >
            Create Profile
          </Button>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", pt: 1 }}>
          {profileTabs.map((t) => (
            <Chip
              key={t.key}
              size="small"
              clickable
              color={activeTab === t.key ? "primary" : "default"}
              variant={activeTab === t.key ? "filled" : "outlined"}
              label={t.count != null ? `${t.label} ${t.count}` : t.label}
              onClick={() => setTab(t.key)}
              role="tab"
              aria-selected={activeTab === t.key}
              data-testid={`profile-tab-${t.key}`}
            />
          ))}
        </Box>

        {/* Per-tab toolbar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            py: 1,
            minHeight: 44,
          }}
        >
          {activeTab === "details" && (
            <>
              {isEditing && isDirty && (
                <Chip size="small" color="warning" label="Unsaved changes" />
              )}
              <Box sx={{ flex: 1 }} />
              {!isEditing ? (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={() => setIsEditing(true)}
                >
                  Edit Profile
                </Button>
              ) : (
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<CancelIcon />}
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={uploading || !isDirty}
                  >
                    Save
                  </Button>
                </>
              )}
            </>
          )}
          {activeTab === "password" && (
            <>
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<LockResetIcon />}
                onClick={handlePasswordChange}
                disabled={!passwordReady}
              >
                {isAdminChangingOtherUser
                  ? `Set Password for ${user.first_name}`
                  : "Save New Password"}
              </Button>
            </>
          )}
          {activeTab === "rights" && (
            <>
              {rightsCatalog.length > 0 && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${rightsOn} of ${totalRights} rights on`}
                />
              )}
              {changedRightCodes.length > 0 && (
                <Chip
                  size="small"
                  color="warning"
                  label={`${changedRightCodes.length} changed`}
                />
              )}
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                onClick={loadUserRights}
                disabled={changedRightCodes.length === 0}
              >
                Reset
              </Button>
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<VerifiedUserIcon />}
                onClick={handleSaveRights}
                disabled={changedRightCodes.length === 0}
              >
                Save Rights
              </Button>
            </>
          )}
          {activeTab === "results" && (
            <>
              <Chip
                size="small"
                variant="outlined"
                label={`${searchResults.length} found`}
              />
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setSearchResults([]);
                  setTab("details");
                }}
              >
                Clear results
              </Button>
            </>
          )}
        </Box>
      </Box>

      {removeTarget && (
        <RemoveUserDialog
          user={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onDone={handleRemoved}
        />
      )}

      <Box sx={{ maxWidth: activeTab === "results" ? "none" : 1100, mx: "auto", pt: 2 }}>
        {/* ---------------- Details ---------------- */}
        {activeTab === "details" && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "260px minmax(0, 1fr)" },
              gap: 2,
              alignItems: "start",
            }}
          >
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
                <Avatar
                  src={avatarSrc}
                  alt="Profile"
                  variant="square"
                  sx={{
                    width: 140,
                    height: 140,
                    borderRadius: 3,
                    bgcolor: user.profile_picture ? "transparent" : "grey.300",
                    fontSize: "3.5rem",
                    border: "2px solid",
                    borderColor: "divider",
                  }}
                >
                  {!user.profile_picture && (user.first_name?.[0] || "U")}
                </Avatar>
                <Button
                  variant="outlined"
                  component="label"
                  size="small"
                  fullWidth
                  disabled={uploading}
                  startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : null}
                >
                  {uploading ? "Uploading..." : "Upload Picture"}
                  <input
                    type="file"
                    hidden
                    accept="image/png, image/jpeg"
                    ref={fileInputRef}
                    onChange={handleUpload}
                  />
                </Button>
                <Typography variant="caption" color="text.secondary">
                  PNG or JPEG
                </Typography>
              </Box>
              <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Organization
                </Typography>
                {isEditing ? (
                  <CreatableSelect
                    name="organization"
                    value={
                      organizations
                        .map((org) => ({ value: org.id, label: org.name, id: org.id }))
                        .find(
                          (opt) =>
                            String(opt.value) ===
                            String(orgIdOf(formData.organization))
                        ) || null
                    }
                    onChange={(option) => {
                      if (option && option.__isNew__) {
                        axios
                          .post(
                            `${API_BASE_URL}/api/users/organizations/`,
                            { name: option.label },
                            { headers: { Authorization: `Bearer ${token}` } }
                          )
                          .then((res) => {
                            setOrganizations((prev) => [...prev, res.data]);
                            setFormData({ ...formData, organization: res.data.id });
                            toast.success("Organization created!");
                          })
                          .catch(() => toast.error("Failed to create organization"));
                      } else {
                        setFormData({
                          ...formData,
                          organization: option ? option.value : "",
                        });
                      }
                    }}
                    options={organizations.map((org) => ({
                      value: org.id,
                      label: org.name,
                      id: org.id,
                    }))}
                    isClearable
                    isSearchable
                    placeholder="Select or type to add organization..."
                    formatCreateLabel={(inputValue) => `Add "${inputValue}"`}
                    menuPlacement="auto"
                    styles={{
                      control: (base) => ({ ...base, minHeight: 40, borderRadius: 8 }),
                      menu: (base) => ({ ...base, zIndex: 9999 }),
                    }}
                  />
                ) : (
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {orgNameOf(user) || "No organization assigned"}
                  </Typography>
                )}
              </Box>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                User information
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5, mb: 2 }}>
                {isEditing
                  ? "Make your changes, then Save."
                  : "Press Edit Profile to change these."}
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 2,
                }}
              >
                {textField("Username", "username")}
                {isEditing && isAdmin ? (
                  <FormControl fullWidth size="small">
                    <InputLabel id="role-label">Role</InputLabel>
                    <MUISelect
                      labelId="role-label"
                      name="role"
                      value={formData.role}
                      label="Role"
                      onChange={handleChange}
                      sx={{ borderRadius: 2 }}
                    >
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="system_admin">System Admin</MenuItem>
                      <MenuItem value="doctor">Doctor</MenuItem>
                      <MenuItem value="registrar">Registrar</MenuItem>
                      <MenuItem value="receptionist">Receptionist</MenuItem>
                      <MenuItem value="patient">Patient</MenuItem>
                    </MUISelect>
                  </FormControl>
                ) : (
                  <TextField
                    label="Role"
                    value={String(user.role || "").replace("_", " ")}
                    fullWidth
                    size="small"
                    disabled
                    sx={{
                      ...readOnlyFieldSx,
                      "& .MuiInputBase-input": { textTransform: "capitalize" },
                    }}
                  />
                )}
                {textField("First Name", "first_name")}
                {textField("Last Name", "last_name")}
                {textField("Email", "email", { type: "email" })}
                {textField("Phone Number", "phone_number", {
                  type: "tel",
                  placeholder: "(123) 456-7890",
                })}
              </Box>
              {isEditing && isAdmin && (
                <Typography
                  variant="body2"
                  sx={{ mt: 2, p: 1, borderRadius: 1, bgcolor: "action.hover", fontSize: 13 }}
                >
                  Changing the role also changes the default rights. Adjust them on
                  the Rights tab.
                </Typography>
              )}
            </Paper>
          </Box>
        )}

        {/* ---------------- Password ---------------- */}
        {activeTab === "password" && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, maxWidth: 560 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Change password
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5, mb: 2 }}>
              {isAdminChangingOtherUser
                ? `You are changing the password for ${user.first_name} ${user.last_name}. Enter your admin password for verification.`
                : "Enter your current password, then choose a new one."}
            </Typography>
            <Stack spacing={2}>
              <TextField
                label={isAdminChangingOtherUser ? "Your Admin Password" : "Current Password"}
                type="password"
                name="current_password"
                value={passwordData.current_password}
                onChange={(e) =>
                  setPasswordData({ ...passwordData, current_password: e.target.value })
                }
                fullWidth
                size="small"
                sx={readOnlyFieldSx}
                helperText={
                  isAdminChangingOtherUser
                    ? "Enter your current admin password"
                    : "Enter your current password"
                }
              />
              <TextField
                label={`New Password${isAdminChangingOtherUser ? ` for ${user.first_name}` : ""}`}
                type="password"
                name="new_password"
                value={passwordData.new_password}
                onChange={(e) =>
                  setPasswordData({ ...passwordData, new_password: e.target.value })
                }
                fullWidth
                size="small"
                sx={readOnlyFieldSx}
              />
              <TextField
                label="Confirm New Password"
                type="password"
                name="confirm_password"
                value={passwordData.confirm_password}
                onChange={(e) =>
                  setPasswordData({ ...passwordData, confirm_password: e.target.value })
                }
                fullWidth
                size="small"
                error={passwordMismatch}
                helperText={passwordMismatch ? "The passwords do not match." : " "}
                sx={readOnlyFieldSx}
              />
            </Stack>
          </Paper>
        )}

        {/* ---------------- Rights (admins) ---------------- */}
        {activeTab === "rights" && isAdmin && (
          <Box sx={{ maxWidth: 760 }}>
            {rightsLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
                <CircularProgress size={28} />
              </Box>
            ) : rightsCatalog.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Could not load the rights catalog.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                <Typography
                  variant="body2"
                  sx={{ p: 1.25, borderRadius: 1, bgcolor: "action.hover", fontSize: 13 }}
                >
                  Rights for{" "}
                  <strong>
                    {user.first_name} {user.last_name}
                  </strong>{" "}
                  (role: <strong>{user.role}</strong>). Turn a right on or off to
                  grant or revoke it for this user specifically; this overrides
                  what their role would normally give them. Changed rights are
                  highlighted.
                </Typography>
                {rightsCatalog.map((cat) => {
                  const onCount = cat.rights.filter((r) => rightsChecked[r.code]).length;
                  return (
                    <Paper key={cat.category} variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          px: 1.5,
                          py: 0.75,
                          bgcolor: "action.hover",
                        }}
                      >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {cat.category}
                        </Typography>
                        <Chip size="small" variant="outlined" label={`${onCount}/${cat.rights.length}`} />
                      </Box>
                      {cat.rights.map((r) => {
                        const isRoleDefault = roleDefaultRights.includes(r.code);
                        const checked = !!rightsChecked[r.code];
                        const isOverridden = checked !== isRoleDefault;
                        const changed = checked !== !!rightsBaseline[r.code];
                        return (
                          <Box
                            key={r.code}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              px: 1.5,
                              py: 0.25,
                              borderTop: "1px solid",
                              borderColor: "divider",
                              bgcolor: changed ? "warning.light" : "transparent",
                            }}
                          >
                            <Switch
                              size="small"
                              checked={checked}
                              onChange={(e) =>
                                setRightsChecked((prev) => ({
                                  ...prev,
                                  [r.code]: e.target.checked,
                                }))
                              }
                              inputProps={{ "aria-label": r.label }}
                            />
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {r.label}
                            </Typography>
                            {isOverridden ? (
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, color: checked ? "success.main" : "error.main" }}
                              >
                                {checked ? "(granted override)" : "(revoked)"}
                              </Typography>
                            ) : (
                              isRoleDefault && (
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                  (role default)
                                </Typography>
                              )
                            )}
                            {changed && <Chip size="small" color="warning" label="Changed" />}
                          </Box>
                        );
                      })}
                    </Paper>
                  );
                })}
              </Stack>
            )}
            {user && user.role !== "patient" && <UserFacilitiesPanel user={user} />}
          </Box>
        )}

        {/* ---------------- Search results ---------------- */}
        {activeTab === "results" && searchResults.length > 0 && (
          <Box sx={{ overflowX: { xs: "auto", md: "clip" } }}>
            <Table size="small" sx={{ minWidth: loggedInUserRole === "system_admin" ? 800 : 600 }}>
              <TableHead>
                <TableRow>
                  {[
                    "Name",
                    "Username",
                    "Email",
                    "Role",
                    ...(loggedInUserRole === "system_admin" ? ["Organization"] : []),
                  ].map((h) => (
                    <TableCell
                      key={h}
                      sx={{
                        position: "sticky",
                        top: STICKY_TOP,
                        zIndex: 2,
                        bgcolor: "action.hover",
                        fontWeight: 700,
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                  <TableCell
                    align="right"
                    sx={{
                      position: "sticky",
                      top: STICKY_TOP,
                      zIndex: 2,
                      bgcolor: "action.hover",
                      fontWeight: 700,
                    }}
                  >
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {searchResults.map((result) => (
                  <TableRow key={result.id} hover sx={{ opacity: result.is_active === false ? 0.7 : 1 }}>
                    <TableCell>
                      {result.first_name} {result.last_name}
                      {result.is_active === false && (
                        <Chip size="small" color="error" label="Removed" sx={{ ml: 0.75, height: 20 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                      {result.username}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.8rem" }}>{result.email}</TableCell>
                    <TableCell sx={{ textTransform: "capitalize", fontSize: "0.8rem" }}>
                      {result.role}
                    </TableCell>
                    {loggedInUserRole === "system_admin" && (
                      <TableCell sx={{ fontSize: "0.8rem" }}>
                        {result.organization_name ||
                          (result.organization && typeof result.organization === "object"
                            ? result.organization.name
                            : "Unknown")}
                      </TableCell>
                    )}
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => selectPerson(result)}
                        sx={{ mr: 1 }}
                      >
                        Select
                      </Button>
                      {isAdmin &&
                        (result.is_active === false ? (
                          result.removed_at ? (
                            <Button size="small" onClick={() => handleRestore(result)}>
                              Restore
                            </Button>
                          ) : null
                        ) : (
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            aria-label={`Remove ${result.first_name} ${result.last_name} from the organization`}
                            title="Remove from organization"
                            onClick={() => setRemoveTarget(result)}
                          >
                            Remove
                          </Button>
                        ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>
    </Container>
  );
}

export default ProfilePage;
