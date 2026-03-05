import { createHttpServer } from './server';

const { httpServer } = createHttpServer();

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
