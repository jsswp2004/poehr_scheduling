import React, { useCallback, useRef, useState, useEffect, memo } from 'react';
import { Box, TextField, Paper, Typography } from '@mui/material';

// PRODUCTION-READY ADDRESS AUTOCOMPLETE WITH GOOGLE PLACES API + COST OPTIMIZATION
const SimpleAddressAutocomplete = memo(function SimpleAddressAutocomplete({
    value,
    onChange,
    disabled,
}) {
    const inputRef = useRef(null);
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const abortControllerRef = useRef(null);

    // Cost Optimization #2: Local caching to reduce duplicate API calls
    const cacheRef = useRef(new Map());
    const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes cache

    // Cache helper functions
    const getCachedSuggestions = useCallback((query) => {
        const cached = cacheRef.current.get(query.toLowerCase());
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.suggestions;
        }
        return null;
    }, [CACHE_DURATION]);

    const setCachedSuggestions = useCallback((query, suggestions) => {
        cacheRef.current.set(query.toLowerCase(), {
            suggestions,
            timestamp: Date.now()
        });

        // Clean old cache entries (simple cleanup)
        if (cacheRef.current.size > 100) {
            const entries = Array.from(cacheRef.current.entries());
            const now = Date.now();
            entries.forEach(([key, value]) => {
                if (now - value.timestamp > CACHE_DURATION) {
                    cacheRef.current.delete(key);
                }
            });
        }
    }, [CACHE_DURATION]);

    // Sync the input value with the parent value only when needed
    useEffect(() => {
        if (inputRef.current && inputRef.current.value !== value) {
            inputRef.current.value = value || '';
        }
    }, [value]);

    // Google Places API with fallback to OpenStreetMap + Cost Optimization
    const fetchAddressSuggestions = useCallback(async (query) => {
        if (query.length < 2) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        // Cost Optimization #2: Check cache first
        const cachedResults = getCachedSuggestions(query);
        if (cachedResults) {
            console.log('Using cached address suggestions for:', query);
            setSuggestions(cachedResults);
            setShowDropdown(cachedResults.length > 0);
            setSelectedIndex(-1);
            setIsLoading(false);
            return;
        }

        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Create new abort controller
        abortControllerRef.current = new AbortController();

        setIsLoading(true);

        try {
            let addressSuggestions = [];

            // Strategy 1: Try to use Google Places API if available and loaded
            const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_PLACES_API_KEY;

            if (GOOGLE_API_KEY && window.google?.maps?.places?.AutocompleteService) {
                try {
                    const service = new window.google.maps.places.AutocompleteService();

                    const request = {
                        input: query,
                        types: ['address'],
                        componentRestrictions: { country: 'us' },
                    };

                    // Use Promise wrapper for the callback-based API
                    const predictions = await new Promise((resolve, reject) => {
                        service.getPlacePredictions(request, (predictions, status) => {
                            if (
                                status === window.google.maps.places.PlacesServiceStatus.OK &&
                                predictions
                            ) {
                                resolve(predictions);
                            } else {
                                reject(new Error(`Google Places API status: ${status}`));
                            }
                        });
                    });

                    // Cost Optimization #4: Limit to 5 results max to reduce costs
                    const limitedPredictions = predictions.slice(0, 5);
                    const googleSuggestions = limitedPredictions.map(
                        (prediction) => prediction.description
                    );

                    // Cost Optimization #2: Cache the results
                    setCachedSuggestions(query, googleSuggestions);
                    console.log('Google Places API call made for:', query, '- Results cached');

                    setSuggestions(googleSuggestions);
                    setShowDropdown(googleSuggestions.length > 0);
                    setSelectedIndex(-1);
                    setIsLoading(false);
                    return; // Successfully used Google API, exit early
                } catch (googleError) {
                    console.warn('Google Places API failed:', googleError);
                    // Continue to OpenStreetMap fallback
                }
            } else if (
                GOOGLE_API_KEY &&
                !window.google?.maps?.places?.AutocompleteService
            ) {
                // Google API key is available but Google Maps script not loaded yet
                // Load Google Maps script dynamically
                if (!window.googleMapsScriptLoading && !window.google) {
                    window.googleMapsScriptLoading = true;
                    const script = document.createElement('script');
                    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`;
                    script.async = true;
                    script.defer = true;
                    script.onload = () => {
                        window.googleMapsScriptLoading = false;
                        console.log('Google Maps script loaded successfully');
                    };
                    script.onerror = () => {
                        window.googleMapsScriptLoading = false;
                        console.warn('Failed to load Google Maps script');
                    };
                    document.head.appendChild(script);
                }
                // Fall through to OpenStreetMap for this request
            }

            // Strategy 2: Fallback to OpenStreetMap (Photon API)
            try {
                const photonResponse = await fetch(
                    `https://photon.komoot.io/api/?q=${encodeURIComponent(
                        query
                    )}&limit=6`,
                    { signal: abortControllerRef.current.signal }
                );

                if (photonResponse.ok) {
                    const photonData = await photonResponse.json();
                    const photonSuggestions =
                        photonData.features?.map((feature) => {
                            const props = feature.properties;
                            const parts = [];

                            // Build comprehensive address from all available components
                            if (props.housenumber) parts.push(props.housenumber);

                            // Handle street names more comprehensively
                            if (props.street) {
                                parts.push(props.street);
                            } else if (props.name && !props.city && !props.state) {
                                parts.push(props.name);
                            }

                            // Handle locality (city/town/village)
                            if (props.city) {
                                parts.push(props.city);
                            } else if (props.district) {
                                parts.push(props.district);
                            } else if (props.county) {
                                parts.push(props.county);
                            }

                            if (props.state) parts.push(props.state);
                            if (props.postcode) parts.push(props.postcode);

                            const fullAddress = parts.join(', ');
                            return (
                                fullAddress || props.name || props.display_name || 'Address'
                            );
                        }) || [];

                    addressSuggestions.push(...photonSuggestions);
                }
            } catch (photonError) {
                console.warn('Photon API failed:', photonError);
            }

            // Strategy 3: Enhanced fallback suggestions based on query pattern
            if (addressSuggestions.length === 0) {
                const fallbackSuggestions = [];

                // Analyze the query to provide intelligent suggestions
                if (/^\d+\s+/.test(query)) {
                    // Starts with house number - suggest street types
                    fallbackSuggestions.push(
                        `${query} Street`,
                        `${query} Avenue`,
                        `${query} Drive`,
                        `${query} Road`,
                        `${query} Lane`
                    );
                } else if (/\d{5}(-\d{4})?/.test(query)) {
                    // Contains ZIP code - suggest locations
                    const zipMatch = query.match(/\d{5}(-\d{4})?/)[0];
                    fallbackSuggestions.push(
                        `Main Street, ${zipMatch}`,
                        `First Avenue, ${zipMatch}`,
                        `Park Avenue, ${zipMatch}`,
                        `${query}, USA`
                    );
                } else if (
                    query.toLowerCase().includes('street') ||
                    query.toLowerCase().includes('avenue') ||
                    query.toLowerCase().includes('road') ||
                    query.toLowerCase().includes('drive') ||
                    query.toLowerCase().includes('lane') ||
                    query.toLowerCase().includes('blvd')
                ) {
                    // Already contains street type - suggest completions
                    fallbackSuggestions.push(
                        `${query}, City, State`,
                        `123 ${query}`,
                        `456 ${query}`,
                        `${query}, USA`
                    );
                } else {
                    // General query - could be street name, city, etc.
                    fallbackSuggestions.push(
                        `${query} Street`,
                        `${query} Avenue`,
                        `${query} Drive`,
                        `123 ${query} Street`,
                        `${query}, USA`
                    );
                }

                addressSuggestions = fallbackSuggestions;
            }

            // Remove duplicates and limit results
            const uniqueSuggestions = [...new Set(addressSuggestions)].slice(0, 6);

            // Cache the OpenStreetMap/fallback results too (for cost optimization)
            if (uniqueSuggestions.length > 0) {
                setCachedSuggestions(query, uniqueSuggestions);
                console.log('OpenStreetMap/fallback results cached for:', query);
            }

            setSuggestions(uniqueSuggestions);
            setShowDropdown(uniqueSuggestions.length > 0);
            setSelectedIndex(-1);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn('All address lookup methods failed:', error);
                // Final fallback
                setSuggestions([
                    `${query} (Type full address)`,
                    `${query} Street`,
                    `${query} Avenue`,
                ]);
                setShowDropdown(true);
            }
        } finally {
            setIsLoading(false);
        }
    }, [getCachedSuggestions, setCachedSuggestions]);

    // Debounce the API calls
    useEffect(() => {
        const currentValue = inputRef.current?.value || '';
        const timeoutId = setTimeout(() => {
            fetchAddressSuggestions(currentValue);
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [fetchAddressSuggestions]);

    const handleInputChange = (event) => {
        const newValue = event.target.value;
        onChange(newValue);

        // Trigger suggestions fetch
        const timeoutId = setTimeout(() => {
            fetchAddressSuggestions(newValue);
        }, 300);

        return () => clearTimeout(timeoutId);
    };

    const handleSuggestionClick = (suggestion) => {
        onChange(suggestion);
        setShowDropdown(false);
        setSelectedIndex(-1);
        inputRef.current?.focus();
    };

    const handleKeyDown = (event) => {
        if (!showDropdown || suggestions.length === 0) return;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                setSelectedIndex((prev) =>
                    prev < suggestions.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                event.preventDefault();
                setSelectedIndex((prev) =>
                    prev > 0 ? prev - 1 : suggestions.length - 1
                );
                break;
            case 'Enter':
                event.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                    handleSuggestionClick(suggestions[selectedIndex]);
                }
                break;
            case 'Escape':
                setShowDropdown(false);
                setSelectedIndex(-1);
                break;
            default:
                // No action needed for other keys
                break;
        }
    };

    const handleBlur = () => {
        // Delay hiding to allow clicks on suggestions
        setTimeout(() => {
            setShowDropdown(false);
            setSelectedIndex(-1);
        }, 150);
    };

    const currentValue = value || '';

    return (
        <Box sx={{ position: 'relative', width: '100%' }}>
            <TextField
                inputRef={inputRef}
                label="Address *"
                defaultValue={currentValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onFocus={() =>
                    currentValue.length >= 2 && setShowDropdown(suggestions.length > 0)
                }
                fullWidth
                required
                disabled={disabled}
                placeholder="Enter street address..."
                InputProps={{
                    endAdornment: isLoading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                            <Box
                                sx={{
                                    width: 16,
                                    height: 16,
                                    border: '2px solid #ccc',
                                    borderTop: '2px solid #1976d2',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    '@keyframes spin': {
                                        '0%': { transform: 'rotate(0deg)' },
                                        '100%': { transform: 'rotate(360deg)' },
                                    },
                                }}
                            />
                        </Box>
                    ) : null,
                }}
                error={!currentValue && disabled === false}
                helperText={
                    !currentValue && disabled === false ? 'Address is required' : ''
                }
            />

            {showDropdown && suggestions.length > 0 && (
                <Paper
                    elevation={3}
                    sx={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 10000,
                        maxHeight: 200,
                        overflow: 'auto',
                        mt: 0.5,
                    }}
                >
                    {suggestions.map((suggestion, index) => (
                        <Box
                            key={index}
                            sx={{
                                px: 2,
                                py: 1.5,
                                cursor: 'pointer',
                                backgroundColor:
                                    selectedIndex === index ? 'action.hover' : 'transparent',
                                '&:hover': {
                                    backgroundColor: 'action.hover',
                                },
                                borderBottom: index < suggestions.length - 1 ? 1 : 0,
                                borderColor: 'divider',
                            }}
                            onClick={() => handleSuggestionClick(suggestion)}
                        >
                            <Typography variant="body2">{suggestion}</Typography>
                        </Box>
                    ))}
                </Paper>
            )}
        </Box>
    );
});

export default SimpleAddressAutocomplete;
