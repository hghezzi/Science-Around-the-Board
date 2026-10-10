// src/components/ErrorBoundary.jsx
// Last line of defence: an unexpected error shows a way back instead of a blank page.
// The autosaved session is kept, so "Reload" offers to resume it.
import React from "react";
import { Box, Button, Typography, Paper } from "@mui/material";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Learn Around the Board stopped:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, bgcolor: "background.default" }}>
        <Paper role="alert" sx={{ p: 4, maxWidth: 520, textAlign: "center" }}>
          <Typography variant="h5" component="h1" sx={{ mb: 1 }}>Something went wrong</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            The game hit an unexpected problem. Reload the page: a session in progress is saved and can be resumed.
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>Reload</Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            If it keeps happening, please{" "}
            <a href="https://github.com/hghezzi/Learn-Around-the-Board/issues/new/choose" target="_blank" rel="noopener noreferrer">report it</a>.
          </Typography>
        </Paper>
      </Box>
    );
  }
}
