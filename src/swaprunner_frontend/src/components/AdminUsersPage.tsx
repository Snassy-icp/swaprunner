import React, { useState, useEffect } from 'react';
import { backendService } from '../services/backend';
import { adminService } from '../services/admin';
import { FiCheck, FiX, FiEdit2, FiTrash2, FiUserPlus } from 'react-icons/fi';
import '../styles/AdminUsersPage.css';
import { Principal } from '@dfinity/principal';

interface UserProfile {
    principal: string;
    name: string;
    description: string;
    logo_url: [string] | [];
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
    principal: Principal;
    name: string;
    description: string;
    logo_url: [string] | [];
    social_links: Array<{
        platform: string;
        url: string;
    }>;
}

interface UpdateUserProfileArgs {
    name: [string] | [];
    description: [string] | [];
    logo_url: [string] | [];
    social_links?: Array<{
        platform: string;
        url: string;
    }>;
    verified: [boolean] | [];
}

const AdminUsersPage: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 10;

    useEffect(() => {
        const init = async () => {
            try {
                console.log('Initializing admin users page...');
                setIsLoading(true);
                setError(null);
                
                console.log('Checking admin status...');
                const adminStatus = await adminService.isAdmin();
                console.log('Admin status:', adminStatus);
                setIsAdmin(adminStatus);
                
                if (adminStatus) {
                    await loadProfiles();
                } else {
                    console.log('Not an admin, skipping profile fetch');
                    setError('You do not have admin access.');
                }
            } catch (err) {
                console.error('Error initializing admin users page:', err);
                setError(err instanceof Error ? err.message : 'Failed to load user profiles');
            } finally {
                setIsLoading(false);
            }
        };

        init();
    }, [offset]);

    const loadProfiles = async () => {
        try {
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
                verified: !profile.verified ? [true] : [false],
                name: profile.name ? [profile.name] : [],
                description: profile.description ? [profile.description] : [],
                logo_url: profile.logo_url
            });
        } catch (err) {
            setError('Failed to toggle verification');
            console.error('Error toggling verification:', err);
        }
    };

    const formatDate = (timestamp: bigint) => {
        return new Date(Number(timestamp)).toLocaleString();
    };

    if (isLoading) {
        return (
            <div className="admin-users-page">
                <div className="loading">Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="admin-users-page">
                <div className="error-message">{error}</div>
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
                                        <span className="principal">{profile.principal.toString()}</span>
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

            {hasMore && !isLoading && (
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
        principal: Principal.anonymous(),
        name: '',
        description: '',
        logo_url: [],
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
                    value={formData.principal.toText()}
                    onChange={e => setFormData(prev => ({ ...prev, principal: Principal.fromText(e.target.value) }))}
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
                    value={formData.logo_url[0] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, logo_url: e.target.value ? [e.target.value] : [] }))}
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
        name: profile.name ? [profile.name] : [],
        description: profile.description ? [profile.description] : [],
        logo_url: profile.logo_url,
        social_links: profile.social_links,
        verified: profile.verified ? [true] : [false]
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
                    value={formData.name[0] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value ? [e.target.value] : [] }))}
                    required
                />
            </div>

            <div className="form-group">
                <label>Description:</label>
                <textarea
                    value={formData.description[0] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value ? [e.target.value] : [] }))}
                    required
                />
            </div>

            <div className="form-group">
                <label>Logo URL:</label>
                <input
                    type="url"
                    value={formData.logo_url[0] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, logo_url: e.target.value ? [e.target.value] : [] }))}
                />
            </div>

            <div className="form-group checkbox-group">
                <label>
                    <input
                        type="checkbox"
                        checked={formData.verified[0]}
                        onChange={e => setFormData(prev => ({ ...prev, verified: e.target.checked ? [true] : [false] }))}
                    />
                    Verified
                </label>
            </div>

            <div className="form-actions">
                <button type="submit" className="submit-button">Update Profile</button>
                <button type="button" className="cancel-button" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
};

export default AdminUsersPage; 