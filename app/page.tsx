import { Container, Typography, Button } from '@mui/material';

export default function Home() {
  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Typography variant="h1" component="h1" gutterBottom>
        Welcome
      </Typography>
      <Button variant="contained">Get Started</Button>
    </Container>
  );
}