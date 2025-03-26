import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Autocomplete,
  Alert,
} from '@mui/material';
import axios from 'axios';

const RequestForm = () => {
  const [college, setCollege] = useState(null);
  const [email, setEmail] = useState('');
  const [collegeOptions, setCollegeOptions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const searchColleges = async (query) => {
    if (query.length < 2) return;
    try {
      const response = await axios.get(`/api/colleges/search?q=${query}`);
      setCollegeOptions(response.data.map(college => ({
        label: college['school.name'],
        value: college['school.name']
      })));
    } catch (err) {
      setError('Error searching for colleges. Please try again.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!college || !email) {
      setError('Please fill in all fields');
      return;
    }

    try {
      await axios.post('/api/requests', {
        college_name: college.label,
        email: email
      });
      setSuccess('Request submitted successfully!');
      setCollege(null);
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Error submitting request. Please try again.');
    }
  };

  return (
    <Box
      sx={{
        maxWidth: 600,
        mx: 'auto',
        mt: 4,
      }}
    >
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Request College Merchandise
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Enter your college name and email to request merchandise for your school.
        </Typography>

        <form onSubmit={handleSubmit}>
          <Autocomplete
            options={collegeOptions}
            value={college}
            onChange={(event, newValue) => setCollege(newValue)}
            onInputChange={(event, newInputValue) => searchColleges(newInputValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="College Name"
                required
                fullWidth
                margin="normal"
                error={!!error && !college}
                helperText={error && !college ? 'Please select a valid college' : ''}
              />
            )}
            getOptionLabel={(option) => option.label || ''}
            isOptionEqualToValue={(option, value) => option.value === value.value}
          />

          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            margin="normal"
            error={!!error && !email}
            helperText={error && !email ? 'Please enter a valid email' : ''}
          />

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {success}
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            fullWidth
            sx={{ mt: 3 }}
          >
            Submit Request
          </Button>
        </form>
      </Paper>
    </Box>
  );
};

export default RequestForm; 