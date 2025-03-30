import React, { useState, useEffect } from 'react';
import { Principal } from '@dfinity/principal';
import { backendService } from '../services/backend';
import '../styles/AdminAchievementsPage.css';

// Frontend types (used in our React components)
type ParameterType = 'Principal' | 'Nat' | 'Text';

// Backend types (matching Motoko variants)
type BackendParameterType = {
    Principal: null;
} | {
    Nat: null;
} | {
    Text: null;
};

interface ParameterSpec {
    name: string;
    type_: BackendParameterType;
    default_value?: string;
}

interface Parameter {
    name: string;
    type_: ParameterType;
    value: string;
}

interface ConditionUsage {
    condition_key: string;
    parameters: Parameter[];
}

interface Achievement {
    id: string;
    name: string;
    description: string;
    logo_url?: string;
    condition_usages: ConditionUsage[];
    predicate?: {
        AND?: [any, any];
        OR?: [any, any];
        NOT?: any;
        REF?: number;
    };
}

interface Condition {
    key: string;
    name: string;
    description: string;
    parameter_specs: ParameterSpec[];
}

// Helper function to extract frontend type from backend variant
function getTypeFromVariant(typeVariant: BackendParameterType): ParameterType {
    // Check if typeVariant is a direct variant object
    if (typeVariant && typeof typeVariant === 'object') {
        if ('Principal' in typeVariant) return 'Principal';
        if ('Nat' in typeVariant) return 'Nat';
        if ('Text' in typeVariant) return 'Text';
    }
    
    // Handle the case where typeVariant might be a direct string or have a type property
    if (typeVariant && typeof typeVariant === 'object' && 'type_' in typeVariant) {
        const type = (typeVariant as any).type_;
        if (type === '#Principal') return 'Principal';
        if (type === '#Nat') return 'Nat';
        if (type === '#Text') return 'Text';
    }
    
    console.error('Invalid type variant:', typeVariant);
    return 'Text'; // Default fallback
}

// Helper function to create a parameter with proper type
function createParameter(name: string, typeVariant: BackendParameterType | any, value: string): Parameter {
    console.log('Creating parameter:', { name, typeVariant, value });
    
    let type_: ParameterType;
    
    // Handle direct variant objects
    if (typeVariant && typeof typeVariant === 'object') {
        type_ = getTypeFromVariant(typeVariant);
    } else {
        // Default to Text if we can't determine the type
        type_ = 'Text';
    }
    
    console.log('Parameter created with type:', type_);
    return {
        name,
        type_,
        value
    };
}

// Helper function to create a backend parameter type
function createBackendType(type: ParameterType): BackendParameterType {
    switch (type) {
        case 'Principal':
            return { Principal: null };
        case 'Nat':
            return { Nat: null };
        case 'Text':
            return { Text: null };
    }
}

function ConditionUsageEditor({ 
    usage, 
    conditions,
    onChange,
    onRemove 
}: { 
    usage: ConditionUsage;
    conditions: Condition[];
    onChange: (usage: ConditionUsage) => void;
    onRemove: () => void;
}) {
    console.log('ConditionUsageEditor - Initial usage:', usage);
    console.log('ConditionUsageEditor - Available conditions:', conditions);
    
    const selectedCondition = conditions.find(c => c.key === usage.condition_key);
    console.log('ConditionUsageEditor - Selected condition:', selectedCondition);

    // Initialize parameters if they don't exist or if they're missing type information
    React.useEffect(() => {
        if (selectedCondition) {
            console.log('ConditionUsageEditor - useEffect - Creating parameters for condition:', selectedCondition.key);
            const newParameters = selectedCondition.parameter_specs.map((spec, index) => {
                const existingParam = usage.parameters[index];
                console.log('ConditionUsageEditor - useEffect - Processing spec:', spec);
                console.log('ConditionUsageEditor - useEffect - Existing param:', existingParam);
                
                return createParameter(
                    spec.name,
                    spec.type_,
                    existingParam?.value || spec.default_value || ''
                );
            });

            console.log('ConditionUsageEditor - useEffect - New parameters:', newParameters);
            console.log('ConditionUsageEditor - useEffect - Current parameters:', usage.parameters);

            // Only update if parameters have changed
            if (JSON.stringify(newParameters) !== JSON.stringify(usage.parameters)) {
                console.log('ConditionUsageEditor - useEffect - Parameters changed, updating');
                onChange({
                    condition_key: usage.condition_key,
                    parameters: newParameters
                });
            }
        }
    }, [selectedCondition, usage.condition_key]);

    const handleParameterChange = (spec: ParameterSpec, index: number, value: string) => {
        console.log('handleParameterChange - Spec:', spec);
        console.log('handleParameterChange - Index:', index);
        console.log('handleParameterChange - New value:', value);
        console.log('handleParameterChange - Current parameters:', usage.parameters);
        
        const newParameters = [...usage.parameters];
        newParameters[index] = createParameter(spec.name, spec.type_, value);
        
        console.log('handleParameterChange - Updated parameters:', newParameters);
        
        onChange({
            condition_key: usage.condition_key,
            parameters: newParameters
        });
    };

    return (
        <div className="condition-usage-editor">
            <div className="condition-select">
                <label>Condition:</label>
                <select 
                    value={usage.condition_key}
                    onChange={(e) => {
                        console.log('Condition select - Selected value:', e.target.value);
                        const newCondition = conditions.find(c => c.key === e.target.value);
                        console.log('Condition select - Found condition:', newCondition);
                        if (!newCondition) return;
                        
                        const parameters = newCondition.parameter_specs.map(spec => {
                            console.log('Condition select - Processing spec:', spec);
                            return createParameter(
                                spec.name,
                                spec.type_,
                                spec.default_value || ''
                            );
                        });
                        
                        console.log('Condition select - Final parameters:', parameters);
                        onChange({
                            condition_key: e.target.value,
                            parameters
                        });
                    }}
                >
                    <option value="">Select a condition</option>
                    {conditions.map(condition => (
                        <option key={condition.key} value={condition.key}>
                            {condition.name}
                        </option>
                    ))}
                </select>
            </div>

            {selectedCondition && (
                <div className="parameters-editor">
                    {selectedCondition.parameter_specs.map((spec, index) => {
                        console.log('Parameter input - Processing spec:', spec);
                        console.log('Parameter input - Current parameters:', usage.parameters);
                        const param = usage.parameters[index] || createParameter(
                            spec.name,
                            spec.type_,
                            spec.default_value || ''
                        );
                        console.log('Parameter input - Using param:', param);
                        return (
                            <div key={spec.name} className="parameter-input">
                                <label>{spec.name}:</label>
                                <input
                                    type={param.type_ === 'Nat' ? 'number' : 'text'}
                                    value={param.value}
                                    onChange={(e) => handleParameterChange(spec, index, e.target.value)}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            <button type="button" onClick={onRemove} className="remove-condition">
                Remove Condition
            </button>
        </div>
    );
}

function PredicateEditor({
    predicate,
    maxRef,
    onChange,
    onRemove
}: {
    predicate: Achievement['predicate'],
    maxRef: number,
    onChange: (predicate: Achievement['predicate']) => void,
    onRemove: () => void
}) {
    const [type, setType] = useState<'AND' | 'OR' | 'NOT' | 'REF'>(
        predicate ? 
            Object.keys(predicate)[0] as any :
            'REF'
    );

    const handleTypeChange = (newType: typeof type) => {
        setType(newType);
        switch (newType) {
            case 'AND':
            case 'OR':
                onChange({
                    [newType]: [
                        { REF: 0 },
                        { REF: 0 }
                    ]
                });
                break;
            case 'NOT':
                onChange({
                    NOT: { REF: 0 }
                });
                break;
            case 'REF':
                onChange({
                    REF: 0
                });
                break;
        }
    };

    return (
        <div className="predicate-editor">
            <div className="predicate-type">
                <label>Type:</label>
                <select 
                    value={type}
                    onChange={(e) => handleTypeChange(e.target.value as typeof type)}
                >
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                    <option value="NOT">NOT</option>
                    <option value="REF">Reference</option>
                </select>
            </div>

            {type === 'REF' && (
                <div className="ref-input">
                    <label>Condition Index:</label>
                    <input
                        type="number"
                        min="0"
                        max={maxRef}
                        value={predicate?.REF || 0}
                        onChange={(e) => onChange({ REF: Math.min(maxRef, Math.max(0, parseInt(e.target.value))) })}
                    />
                </div>
            )}

            {(type === 'AND' || type === 'OR') && predicate && (type in predicate) && (
                <div className="binary-op">
                    <div className="sub-predicate">
                        <h4>Left Operand</h4>
                        <PredicateEditor
                            predicate={(predicate as any)[type][0]}
                            maxRef={maxRef}
                            onChange={(left) => {
                                onChange({
                                    [type]: [
                                        left,
                                        (predicate as any)[type][1]
                                    ]
                                });
                            }}
                            onRemove={() => {}}
                        />
                    </div>
                    <div className="sub-predicate">
                        <h4>Right Operand</h4>
                        <PredicateEditor
                            predicate={(predicate as any)[type][1]}
                            maxRef={maxRef}
                            onChange={(right) => {
                                onChange({
                                    [type]: [
                                        (predicate as any)[type][0],
                                        right
                                    ]
                                });
                            }}
                            onRemove={() => {}}
                        />
                    </div>
                </div>
            )}

            {type === 'NOT' && predicate?.NOT && (
                <div className="unary-op">
                    <h4>Operand</h4>
                    <PredicateEditor
                        predicate={predicate.NOT}
                        maxRef={maxRef}
                        onChange={(child) => {
                            onChange({
                                NOT: child
                            });
                        }}
                        onRemove={() => {}}
                    />
                </div>
            )}

            <button type="button" onClick={onRemove} className="remove-predicate">
                Remove Predicate
            </button>
        </div>
    );
}

function transformToBackendParameter(param: Parameter): BackendParameterType {
    console.log('transformToBackendParameter - Input param:', param);
    
    if (!param.value) {
        console.error(`Empty value for parameter ${param.name} of type ${param.type_}`);
        switch (param.type_) {
            case 'Nat':
                return { Nat: null };
            case 'Principal':
                return { Principal: null };
            case 'Text':
                return { Text: null };
        }
    }

    try {
        console.log('transformToBackendParameter - Processing param type:', param.type_);
        switch (param.type_) {
            case 'Nat':
                const natValue = BigInt(param.value);
                if (natValue < 0) throw new Error('Nat cannot be negative');
                return { Nat: null };
            case 'Principal':
                Principal.fromText(param.value); // Validate principal
                return { Principal: null };
            case 'Text':
                return { Text: null };
            default:
                console.error('transformToBackendParameter - Unknown type:', param.type_);
                return { Text: null };
        }
    } catch (err) {
        console.error(`Error converting parameter ${param.name}:`, err);
        console.log('transformToBackendParameter - Error case - Type:', param.type_);
        // Return appropriate default values based on type
        switch (param.type_) {
            case 'Nat':
                return { Nat: null };
            case 'Principal':
                return { Principal: null };
            default:
                return { Text: null };
        }
    }
}

function transformFromBackendParameter(type_: ParameterType, value: any): string {
    if (value === undefined || value === null) return '';
    
    switch (type_) {
        case 'Nat':
            return value.toString();
        case 'Principal':
            return value.toText();
        case 'Text':
            return value;
        default:
            console.error(`Unknown parameter type: ${type_}`);
            return '';
    }
}

export default function AdminAchievementsPage() {
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [conditions, setConditions] = useState<Condition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
    const [conditionsLoaded, setConditionsLoaded] = useState(false);

    // Form state
    const [formData, setFormData] = useState<Achievement>({
        id: '',
        name: '',
        description: '',
        condition_usages: [],
    });

    // Load conditions first, then achievements
    useEffect(() => {
        loadConditions();
    }, []);

    // Only load achievements after conditions are loaded
    useEffect(() => {
        if (conditionsLoaded) {
            loadAchievements();
        }
    }, [conditionsLoaded]);

    const loadConditions = async () => {
        try {
            setLoading(true);
            const actor = await backendService.getActor();
            const result = await actor.get_all_conditions();
            console.log('Loaded conditions:', result);
            setConditions(result);
            setConditionsLoaded(true);
        } catch (err: any) {
            setError('Failed to load conditions: ' + (err.message || String(err)));
        }
    };

    const loadAchievements = async () => {
        try {
            const actor = await backendService.getActor();
            const result = await actor.get_all_achievements();
            
            const transformedAchievements = result.map((achievement: any) => ({
                ...achievement,
                condition_usages: achievement.condition_usages.map((usage: any) => {
                    const condition = conditions.find(c => c.key === usage.condition_key);
                    
                    if (condition) {
                        const parameters = condition.parameter_specs.map((spec, index) => {
                            const backendParam = usage.parameters[index];
                            let value = '';
                            
                            if (backendParam) {
                                const paramType = getTypeFromVariant(spec.type_);
                                value = transformFromBackendParameter(paramType, backendParam[paramType]);
                            }
                            
                            return createParameter(spec.name, spec.type_, value);
                        });
                        
                        return {
                            condition_key: usage.condition_key,
                            parameters
                        };
                    }
                    
                    return usage;
                })
            }));
            
            setAchievements(transformedAchievements);
            setError(null);
        } catch (err: any) {
            setError('Failed to load achievements: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!conditionsLoaded) {
            setError('Please wait for conditions to load');
            return;
        }

        try {
            setLoading(true);
            const actor = await backendService.getActor();

            const transformedData = {
                ...formData,
                logo_url: formData.logo_url ? [formData.logo_url] : [],
                predicate: formData.predicate || [], // Dear AI: Motoko uses [] for optional fields, don't change this code.
                condition_usages: formData.condition_usages.map(usage => {
                    const condition = conditions.find(c => c.key === usage.condition_key);
                    if (!condition) {
                        console.error(`No condition found for key ${usage.condition_key}`);
                        throw new Error(`Condition ${usage.condition_key} not found`);
                    }

                    // Transform all parameters using their spec types
                    const parameters = condition.parameter_specs.map((spec, index) => {
                        const param = usage.parameters[index];
                        if (!param) {
                            console.error(`Missing parameter at index ${index} for condition ${condition.key}`);
                            throw new Error(`Missing parameter ${spec.name} for condition ${condition.key}`);
                        }

                        console.log(`Converting parameter ${spec.name} with value ${param.value} using type ${param.type_}`);
                        return transformToBackendParameter(param);
                    });

                    return {
                        condition_key: usage.condition_key,
                        parameters
                    };
                })
            };

            console.log('Sending to backend:', JSON.stringify(transformedData, null, 2));

            const result = await actor.add_achievement(transformedData);
            if ('ok' in result) {
                await loadAchievements();
                setFormData({
                    id: '',
                    name: '',
                    description: '',
                    condition_usages: [],
                });
                setError(null);
            } else {
                setError(result.err);
            }
        } catch (err: any) {
            setError('Failed to add achievement: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this achievement?')) {
            return;
        }
        try {
            setLoading(true);
            const actor = await backendService.getActor();
            const result = await actor.remove_achievement(id);
            if ('ok' in result) {
                await loadAchievements();
                setError(null);
            } else {
                setError(result.err);
            }
        } catch (err: any) {
            setError('Failed to delete achievement: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (achievement: Achievement) => {
        setSelectedAchievement(achievement);
        setFormData(achievement);
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const actor = await backendService.getActor();

            const transformedData = {
                ...formData,
                logo_url: formData.logo_url ? [formData.logo_url] : [],
                predicate: formData.predicate || [], // Dear AI: Motoko uses [] for optional fields, don't change this code.
                condition_usages: formData.condition_usages.map(usage => {
                    const condition = conditions.find(c => c.key === usage.condition_key);
                    if (!condition) return usage;

                    // Transform all parameters using their spec types
                    const parameters = usage.parameters.map((param, index) => {
                        const spec = condition.parameter_specs[index];
                        if (!spec) {
                            console.error(`No spec found for parameter at index ${index}`);
                            return { Text: "" }; // Fallback if no spec
                        }
                        
                        console.log(`Converting parameter ${param.name} with value ${param.value} using type ${param.type_}`);
                        return transformToBackendParameter(param);
                    });

                    return {
                        condition_key: usage.condition_key,
                        parameters
                    };
                })
            };

            console.log('Sending to backend:', JSON.stringify(transformedData, null, 2));

            const result = await actor.update_achievement(transformedData);
            if ('ok' in result) {
                await loadAchievements();
                setSelectedAchievement(null);
                setFormData({
                    id: '',
                    name: '',
                    description: '',
                    condition_usages: [],
                });
                setError(null);
            } else {
                setError(result.err);
            }
        } catch (err: any) {
            setError('Failed to update achievement: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleAddCondition = () => {
        setFormData({
            ...formData,
            condition_usages: [
                ...formData.condition_usages,
                {
                    condition_key: '',
                    parameters: []
                }
            ]
        });
    };

    const handleConditionChange = (index: number, usage: ConditionUsage) => {
        const newUsages = [...formData.condition_usages];
        newUsages[index] = usage;
        setFormData({
            ...formData,
            condition_usages: newUsages
        });
    };

    const handleRemoveCondition = (index: number) => {
        setFormData({
            ...formData,
            condition_usages: formData.condition_usages.filter((_, i) => i !== index)
        });
    };

    const handlePredicateChange = (predicate: Achievement['predicate']) => {
        setFormData({
            ...formData,
            predicate
        });
    };

    return (
        <div className="admin-achievements-page">
            <h1>Manage Achievements</h1>
            
            {error && <div className="error-message">{error}</div>}
            
            {!conditionsLoaded ? (
                <div>Loading conditions...</div>
            ) : (
                <form onSubmit={selectedAchievement ? handleUpdate : handleSubmit} className="achievement-form">
                    <h2>{selectedAchievement ? 'Edit Achievement' : 'Add New Achievement'}</h2>
                    
                    <div className="form-group">
                        <label htmlFor="id">ID:</label>
                        <input
                            type="text"
                            id="id"
                            value={formData.id}
                            onChange={(e) => setFormData({...formData, id: e.target.value})}
                            required
                            disabled={!!selectedAchievement}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="name">Name:</label>
                        <input
                            type="text"
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="description">Description:</label>
                        <textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="logo_url">Logo URL (optional):</label>
                        <input
                            type="text"
                            id="logo_url"
                            value={formData.logo_url || ''}
                            onChange={(e) => setFormData({...formData, logo_url: e.target.value})}
                        />
                    </div>

                    <div className="condition-usages">
                        <h3>Conditions</h3>
                        {formData.condition_usages.map((usage, index) => (
                            <ConditionUsageEditor
                                key={index}
                                usage={usage}
                                conditions={conditions}
                                onChange={(usage) => handleConditionChange(index, usage)}
                                onRemove={() => handleRemoveCondition(index)}
                            />
                        ))}
                        <button type="button" onClick={handleAddCondition} className="add-condition">
                            Add Condition
                        </button>
                    </div>

                    <div className="predicate-section">
                        <h3>Predicate (Optional)</h3>
                        <p className="help-text">
                            Use predicates to create complex conditions using AND, OR, and NOT operations.
                            Reference condition indices (0-based) to combine them logically.
                        </p>
                        {formData.predicate ? (
                            <PredicateEditor
                                predicate={formData.predicate}
                                maxRef={Math.max(0, formData.condition_usages.length - 1)}
                                onChange={handlePredicateChange}
                                onRemove={() => setFormData({ ...formData, predicate: undefined })}
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => handlePredicateChange({ REF: 0 })}
                                className="add-predicate"
                            >
                                Add Predicate
                            </button>
                        )}
                    </div>

                    <div className="form-actions">
                        <button type="submit" disabled={loading}>
                            {selectedAchievement ? 'Update Achievement' : 'Add Achievement'}
                        </button>
                        {selectedAchievement && (
                            <button 
                                type="button" 
                                onClick={() => {
                                    setSelectedAchievement(null);
                                    setFormData({
                                        id: '',
                                        name: '',
                                        description: '',
                                        condition_usages: [],
                                    });
                                }}
                            >
                                Cancel Edit
                            </button>
                        )}
                    </div>
                </form>
            )}

            <div className="achievements-list">
                <h2>Existing Achievements</h2>
                {loading ? (
                    <div>Loading...</div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {achievements.map((achievement) => (
                                <tr key={achievement.id}>
                                    <td>{achievement.id}</td>
                                    <td>{achievement.name}</td>
                                    <td>{achievement.description}</td>
                                    <td>
                                        <button onClick={() => handleEdit(achievement)}>Edit</button>
                                        <button onClick={() => handleDelete(achievement.id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
} 