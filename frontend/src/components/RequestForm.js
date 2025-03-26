import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Autocomplete,
  Paper,
  Alert,
  CircularProgress,
  InputAdornment
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SchoolIcon from '@mui/icons-material/School';
import axios from 'axios';

function RequestForm() {
  const [collegeQuery, setCollegeQuery] = useState('');
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    college_name: '',
    email: ''
  });

  useEffect(() => {
    const searchColleges = async () => {
      if (collegeQuery.length < 2) {
        setColleges([]);
        return;
      }
      
      setLoading(true);
      try {
        console.log('Searching for colleges with query:', collegeQuery);
        const response = await axios.get(`http://localhost:5001/api/search-colleges?query=${encodeURIComponent(collegeQuery)}`);
        console.log('College search response:', response.data);
        setColleges(response.data || []);
      } catch (err) {
        console.error('College search error:', err);
        setError('Failed to search colleges. Please try again.');
        setColleges([]);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchColleges, 300);
    return () => clearTimeout(timeoutId);
  }, [collegeQuery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await axios.post('http://localhost:5001/api/submit-request', formData);
      setSuccess('Request submitted successfully!');
      setFormData({
        college_name: '',
        email: ''
      });
      setCollegeQuery('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request. Please try again.');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        College Merchandise Request
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Search for your college:
        </Typography>
        
        <Autocomplete
          open={open}
          onOpen={() => {
            if (collegeQuery.length >= 2) {
              setOpen(true);
            }
          }}
          onClose={() => setOpen(false)}
          options={colleges}
          getOptionLabel={(option) => {
            // Handle both string value and object value cases
            if (typeof option === 'string') return option;
            return option && option.name ? `${option.name} (${option.city}, ${option.state})` : '';
          }}
          loading={loading}
          onInputChange={(event, newInputValue) => {
            console.log('Input changed to:', newInputValue);
            setCollegeQuery(newInputValue);
            if (newInputValue.length >= 2 && !open) {
              setOpen(true);
            } else if (newInputValue.length < 2 && open) {
              setOpen(false);
            }
          }}
          onChange={(event, newValue) => {
            console.log('Selected value:', newValue);
            if (newValue) {
              setFormData(prev => ({
                ...prev,
                college_name: newValue.name || ''
              }));
            }
          }}
          filterOptions={(x) => x} // Don't filter options client-side, we're doing server-side filtering
          isOptionEqualToValue={(option, value) => 
            option.name === value.name && 
            option.city === value.city && 
            option.state === value.state
          }
          renderOption={(props, option) => (
            <li {...props}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <SchoolIcon sx={{ color: 'primary.main', mr: 1 }} />
                <Box>
                  <Typography variant="body1">{option.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {option.city}, {option.state}
                  </Typography>
                </Box>
              </Box>
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="College Name"
              placeholder="Start typing a college name..."
              required
              fullWidth
              onClick={() => {
                if (collegeQuery.length >= 2) {
                  setOpen(true);
                }
              }}
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <>
                    {loading ? <CircularProgress color="inherit" size={20} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
              helperText="Type at least 2 characters to search"
            />
          )}
          noOptionsText="No colleges found. Try a different search term."
          loadingText="Searching colleges..."
          sx={{ mb: 2 }}
        />

        <TextField
          label="Email"
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          fullWidth
          sx={{ mb: 3 }}
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
          fullWidth
        >
          Submit Request
        </Button>
      </Box>
    </Paper>
  );
}

export default RequestForm; 