import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { backendService } from '../services/backend';
import { FiCheck, FiX, FiEdit2, FiTrash2, FiUserPlus } from 'react-icons/fi';
import '../styles/AdminUsersPage.css';

interface UserProfile {
    principal: string;
    name: string;
    description: string;
    logo_url?: string;
    social_links: Array<{
        platform: string;
        url: string;
    }>;
    created_at: bigint;
    updated_at: bigint;
    created_by: string;
    verified: boolean;
}

interface CreateUserProfileArgs {
    principal: string;
    name: string;
    description: string;
    logo_url?: string;
    social_links: Array<{
        platform: string;
        url: string;
    }>;
}

interface UpdateUserProfileArgs {
    name?: string;
    description?: string;
    logo_url?: string;
    social_links?: Array<{
        platform: string;
        url: string;
    }>;
    verified?: boolean;
}

const AdminUsersPage: React.FC = () => {
    const { isAuthenticated, isAdmin } = useAuth();
    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 10;

    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            loadProfiles();
        }
    }, [isAuthenticated, isAdmin, offset]);

    const loadProfiles = async () => {
        try {
            setLoading(true);
            const actor = await backendService.getActor();
            const result = await actor.listUserProfiles(offset, LIMIT);
            if (result.length < LIMIT) {
                setHasMore(false);
            }
            if (offset === 0) {
                setProfiles(result);
            } else {
                setProfiles(prev => [...prev, ...result]);
            }
        } catch (err) {
            setError('Failed to load user profiles');
            console.error('Error loading profiles:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProfile = async (args: CreateUserProfileArgs) => {
        try {
            const actor = await backendService.getActor();
            const result = await actor.createUserProfile(args);
            if ('ok' in result) {
                setShowCreateForm(false);
                loadProfiles();
            } else {
                setError('Failed to create profile: ' + JSON.stringify(result.err));
            }
        } catch (err) {
            setError('Failed to create profile');
            console.error('Error creating profile:', err);
        }
    };

    const handleUpdateProfile = async (principal: string, args: UpdateUserProfileArgs) => {
        try {
            const actor = await backendService.getActor();
            const result = await actor.updateUserProfile(principal, args);
            if ('ok' in result) {
                setEditingProfile(null);
                loadProfiles();
            } else {
                setError('Failed to update profile: ' + JSON.stringify(result.err));
            }
        } catch (err) {
            setError('Failed to update profile');
            console.error('Error updating profile:', err);
        }
    };

    const handleDeleteProfile = async (principal: string) => {
        if (!window.confirm('Are you sure you want to delete this profile?')) {
            return;
        }

        try {
            const actor = await backendService.getActor();
            const result = await actor.deleteUserProfile(principal);
            if ('ok' in result) {
                loadProfiles();
            } else {
                setError('Failed to delete profile: ' + JSON.stringify(result.err));
            }
        } catch (err) {
            setError('Failed to delete profile');
            console.error('Error deleting profile:', err);
        }
    };

    const handleToggleVerification = async (profile: UserProfile) => {
        try {
            await handleUpdateProfile(profile.principal, {
                verified: !profile.verified
            });
        } catch (err) {
            setError('Failed to toggle verification');
            console.error('Error toggling verification:', err);
        }
    };

    const formatDate = (timestamp: bigint) => {
        return new Date(Number(timestamp)).toLocaleString();
    };

    if (!isAuthenticated || !isAdmin) {
        return (
            <div className="admin-users-page">
                <h1>Unauthorized</h1>
                <p>You must be an admin to access this page.</p>
            </div>
        );
    }

    return (
        <div className="admin-users-page">
            <div className="page-header">
                <h1>User Management</h1>
                <button 
                    className="create-button"
                    onClick={() => setShowCreateForm(true)}
                >
                    <FiUserPlus /> Add User
                </button>
            </div>

            {error && (
                <div className="error-message">
                    {error}
                    <button onClick={() => setError(null)}><FiX /></button>
                </div>
            )}

            {showCreateForm && (
                <CreateProfileForm
                    onSubmit={handleCreateProfile}
                    onCancel={() => setShowCreateForm(false)}
                />
            )}

            <div className="profiles-list">
                {profiles.map(profile => (
                    <div key={profile.principal} className="profile-card">
                        {editingProfile?.principal === profile.principal ? (
                            <EditProfileForm
                                profile={profile}
                                onSubmit={(args) => handleUpdateProfile(profile.principal, args)}
                                onCancel={() => setEditingProfile(null)}
                            />
                        ) : (
                            <>
                                <div className="profile-header">
                                    <div className="profile-info">
                                        <h3>{profile.name}</h3>
                                        <span className="principal">{profile.principal}</span>
                                    </div>
                                    <div className="profile-actions">
                                        <button 
                                            className={`verify-button ${profile.verified ? 'verified' : ''}`}
                                            onClick={() => handleToggleVerification(profile)}
                                            title={profile.verified ? 'Remove Verification' : 'Verify User'}
                                        >
                                            <FiCheck />
                                        </button>
                                        <button 
                                            className="edit-button"
                                            onClick={() => setEditingProfile(profile)}
                                        >
                                            <FiEdit2 />
                                        </button>
                                        <button 
                                            className="delete-button"
                                            onClick={() => handleDeleteProfile(profile.principal)}
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </div>
                                </div>
                                <p className="description">{profile.description}</p>
                                {profile.social_links.length > 0 && (
                                    <div className="social-links">
                                        {profile.social_links.map((link, index) => (
                                            <a 
                                                key={index}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {link.platform}
                                            </a>
                                        ))}
                                    </div>
                                )}
                                <div className="profile-footer">
                                    <span>Created: {formatDate(profile.created_at)}</span>
                                    <span>Updated: {formatDate(profile.updated_at)}</span>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {loading && <div className="loading">Loading profiles...</div>}
            
            {hasMore && !loading && (
                <button 
                    className="load-more-button"
                    onClick={() => setOffset(prev => prev + LIMIT)}
                >
                    Load More
                </button>
            )}
        </div>
    );
};

interface CreateProfileFormProps {
    onSubmit: (args: CreateUserProfileArgs) => Promise<void>;
    onCancel: () => void;
}

const CreateProfileForm: React.FC<CreateProfileFormProps> = ({ onSubmit, onCancel }) => {
    const [formData, setFormData] = useState<CreateUserProfileArgs>({
        principal: '',
        name: '',
        description: '',
        logo_url: '',
        social_links: []
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <form className="profile-form" onSubmit={handleSubmit}>
            <h2>Create New Profile</h2>
            
            <div className="form-group">
                <label>Principal ID:</label>
                <input
                    type="text"
                    value={formData.principal}
                    onChange={e => setFormData(prev => ({ ...prev, principal: e.target.value }))}
                    required
                />
            </div>

            <div className="form-group">
                <label>Name:</label>
                <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                />
            </div>

            <div className="form-group">
                <label>Description:</label>
                <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    required
                />
            </div>

            <div className="form-group">
                <label>Logo URL:</label>
                <input
                    type="url"
                    value={formData.logo_url || ''}
                    onChange={e => setFormData(prev => ({ ...prev, logo_url: e.target.value }))}
                />
            </div>

            <div className="form-actions">
                <button type="submit" className="submit-button">Create Profile</button>
                <button type="button" className="cancel-button" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
};

interface EditProfileFormProps {
    profile: UserProfile;
    onSubmit: (args: UpdateUserProfileArgs) => Promise<void>;
    onCancel: () => void;
}

const EditProfileForm: React.FC<EditProfileFormProps> = ({ profile, onSubmit, onCancel }) => {
    const [formData, setFormData] = useState<UpdateUserProfileArgs>({
        name: profile.name,
        description: profile.description,
        logo_url: profile.logo_url,
        social_links: profile.social_links
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <form className="profile-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label>Name:</label>
                <input
                    type="text"
                    value={formData.name || ''}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                />
            </div>

            <div className="form-group">
                <label>Description:</label>
                <textarea
                    value={formData.description || ''}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    required
                />
            </div>

            <div className="form-group">
                <label>Logo URL:</label>
                <input
                    type="url"
                    value={formData.logo_url || ''}
                    onChange={e => setFormData(prev => ({ ...prev, logo_url: e.target.value }))}
                />
            </div>

            <div className="form-actions">
                <button type="submit" className="submit-button">Update Profile</button>
                <button type="button" className="cancel-button" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
};

export default AdminUsersPage; 