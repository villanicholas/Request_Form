import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import axios from 'axios';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const response = await axios.get('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStats(response.data);
      } catch (err) {
        setError('Error fetching statistics. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  const chartData = Object.entries(stats.requests_by_college).map(([college, count]) => ({
    college,
    requests: count
  }));

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Request Statistics
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Total Requests: {stats.total_requests}
        </Typography>
      </Paper>

      <Paper sx={{ p: 3, mb: 3, height: 400 }}>
        <Typography variant="h6" gutterBottom>
          Requests by College
        </Typography>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="college" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="requests" fill="#1976d2" />
          </BarChart>
        </ResponsiveContainer>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Detailed Breakdown
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>College</TableCell>
                <TableCell align="right">Number of Requests</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(stats.requests_by_college)
                .sort(([, a], [, b]) => b - a)
                .map(([college, count]) => (
                  <TableRow key={college}>
                    <TableCell component="th" scope="row">
                      {college}
                    </TableCell>
                    <TableCell align="right">{count}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default AdminDashboard; 