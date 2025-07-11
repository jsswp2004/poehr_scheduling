import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { apiEndpoints, getAuthHeaders, getAuthHeadersForUpload } from '../config/api';
import { notifyProfileUpdated } from '../utils/events';
import { useAuth } from './useAuth';

/**
 * Custom hook for profile management
 */
export const useProfile = () => {
  const { currentUser } = useAuth();
  
  const [profile, setProfile] = useState({
    id: "",
    first_name: "",
    last_name: "",
    email: "",
    username: "",
    roles: [],
    profile_picture: "",
    organization: "",
    is_active: true,
  });
  
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  // Initialize profile with current user data
  useEffect(() => {
    if (currentUser) {
      setProfile(prev => ({
        ...prev,
        ...currentUser,
      }));
    }
  }, [currentUser]);

  // Update profile
  const updateProfile = useCallback(async () => {
    if (!profile.id) return;

    setProfileLoading(true);
    try {
      const response = await axios.put(
        apiEndpoints.updateProfile(profile.id),
        {
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          username: profile.username,
          roles: profile.roles,
          is_active: profile.is_active,
        },
        { headers: getAuthHeaders() }
      );

      setProfile(prev => ({ ...prev, ...response.data }));
      setEditingProfile(false);

      // Notify other components
      notifyProfileUpdated(response.data);
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    } finally {
      setProfileLoading(false);
    }
  }, [profile]);

  // Upload profile picture
  const uploadProfilePicture = useCallback(async (file) => {
    if (!profile.id) return;

    const formData = new FormData();
    formData.append("profile_picture", file);

    try {
      const response = await axios.put(
        apiEndpoints.updateProfile(profile.id),
        formData,
        { headers: getAuthHeadersForUpload() }
      );

      setProfile(prev => ({ ...prev, profile_picture: response.data.profile_picture }));
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      throw error;
    }
  }, [profile.id]);

  // Delete user
  const deleteUser = useCallback(async () => {
    if (!profile.id) return;

    try {
      await axios.delete(
        apiEndpoints.deleteUser(profile.id),
        { headers: getAuthHeaders() }
      );
    } catch (error) {
      console.error("Error deleting user:", error);
      throw error;
    }
  }, [profile.id]);

  return {
    profile,
    setProfile,
    editingProfile,
    setEditingProfile,
    profileLoading,
    updateProfile,
    uploadProfilePicture,
    deleteUser,
  };
};
          username: userResponse.data.username,
          first_name: userResponse.data.first_name,
          last_name: userResponse.data.last_name,
          email: userResponse.data.email,
          phone_number: userResponse.data.phone_number || "",
          organization: userResponse.data.organization,
          role: userResponse.data.role,
        };
        
        console.log("🔍 New FormData:", newFormData);
        setFormData(newFormData);

        // Load organizations
        const orgResponse = await axios.get(
          apiEndpoints.organizations,
          { headers: getAuthHeaders(token) }
        );
        setOrganizations(orgResponse.data);

      } catch (err) {
        console.error("Failed to load profile data:", err);
        toast.error("Could not load profile");
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, [token, currentUser]);

  // Handle form field changes
  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  // Save profile changes
  const handleSave = async () => {
    try {
      const response = await axios.patch(
        apiEndpoints.userUpdate(user.id),
        formData,
        { headers: getAuthHeaders(token) }
      );
      
      setUser(response.data);
      setIsEditing(false);
      notifyProfileUpdated();
      toast.success("Profile updated!");
    } catch (error) {
      console.error("Failed to update profile", error);
      toast.error("Update failed.");
    }
  };

  // Cancel editing
  const handleCancel = () => {
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

  // Handle profile picture upload
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadFormData = new FormData();
    uploadFormData.append("profile_picture", file);
    setUploading(true);

    try {
      const res = await axios.patch(
        apiEndpoints.profilePicture(user.id),
        uploadFormData,
        { headers: getAuthHeadersForUpload(token) }
      );
      
      setUser(res.data);
      notifyProfileUpdated();
      toast.success("Profile picture updated!");
      fileInputRef.current.value = "";
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload profile picture");
    } finally {
      setUploading(false);
    }
  };

  // Create new organization
  const createOrganization = async (organizationName) => {
    try {
      const response = await axios.post(
        apiEndpoints.organizations,
        { name: organizationName },
        { headers: getAuthHeaders(token) }
      );
      
      setOrganizations(prev => [...prev, response.data]);
      setFormData(prev => ({
        ...prev,
        organization: response.data.id,
      }));
      
      toast.success("Organization created!");
      return response.data;
    } catch (error) {
      toast.error("Failed to create organization");
      throw error;
    }
  };

  return {
    // State
    user,
    loading,
    isEditing,
    uploading,
    formData,
    organizations,
    fileInputRef,
    
    // Actions
    setIsEditing,
    handleChange,
    handleSave,
    handleCancel,
    handleUpload,
    createOrganization,
  };
};
