import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

const Navbar = () => {
  const isAdmin = localStorage.getItem('adminToken');

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography
          variant="h6"
          component={RouterLink}
          to="/"
          sx={{
            flexGrow: 1,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          College Merchandise Requests
        </Typography>
        <Box>
          {isAdmin ? (
            <Button
              color="inherit"
              component={RouterLink}
              to="/admin/dashboard"
            >
              Dashboard
            </Button>
          ) : (
            <Button
              color="inherit"
              component={RouterLink}
              to="/admin/login"
            >
              Admin Login
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar; 