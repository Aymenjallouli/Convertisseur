import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Alert,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  CloudUpload,
  Download,
  Delete,
  Transform,
  CheckCircle,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import toast from 'react-hot-toast';

interface FileWithPreview extends File {
  preview?: string;
  id: string;
}

interface ErrorResponse {
  detail: string;
  [key: string]: any;
}

interface ConversionTask {
  id: string;
  fileName: string;
  fromFormat: string;
  toFormat: string;
  status: 'pending' | 'converting' | 'completed' | 'error';
  downloadUrl?: string;
  error?: string | ErrorResponse;
}

const API_BASE = 'http://localhost:8000';

const SUPPORTED_FORMATS = {
  'Document': ['docx', 'txt', 'pdf'],
  'Spreadsheet': ['xlsx', 'csv'],
  'Image': ['jpg', 'jpeg', 'png', 'bmp'],
};

const FileConverter: React.FC = (): React.ReactElement => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [conversions, setConversions] = useState<ConversionTask[]>([]);
  const [isConverting, setIsConverting] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const filesWithPreview = acceptedFiles.map((file) => {
      const fileWithPreview = Object.assign(file, {
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        id: Math.random().toString(36).substr(2, 9),
      });
      return fileWithPreview;
    });
    
    setFiles((prev) => [...prev, ...filesWithPreview]);
    toast.success(`${acceptedFiles.length} file(s) added`);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const getFileExtension = (filename: string): string => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };  const getAvailableFormats = (currentFormat: string): string[] => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const formats of Object.values(SUPPORTED_FORMATS)) {
      if (formats.includes(currentFormat)) {
        return formats.filter(format => format !== currentFormat);
      }
    }
    return [];
  };

  const convertFiles = async () => {
    if (files.length === 0) {
      toast.error('Please select files to convert');
      return;
    }

    if (!selectedFormat) {
      toast.error('Please select a target format');
      return;
    }

    setIsConverting(true);
    const newConversions: ConversionTask[] = [];

    try {
      for (const file of files) {
        const fromFormat = getFileExtension(file.name);
        const availableFormats = getAvailableFormats(fromFormat);
        
        if (!availableFormats.includes(selectedFormat)) {
          toast.error(`Cannot convert ${fromFormat} to ${selectedFormat}`);
          continue;
        }

        const conversionTask: ConversionTask = {
          id: file.id,
          fileName: file.name,
          fromFormat,
          toFormat: selectedFormat,
          status: 'pending',
        };

        newConversions.push(conversionTask);
        setConversions(prev => [...prev, conversionTask]);

        try {
          // Update status to converting
          setConversions(prev => 
            prev.map(conv => 
              conv.id === file.id 
                ? { ...conv, status: 'converting' as const }
                : conv
            )
          );

          // Upload file
          const formData = new FormData();
          formData.append('file', file);

          const uploadResponse = await axios.post(`${API_BASE}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });          const { file_id } = uploadResponse.data;
          
          // Convert file
          const convertResponse = await axios.post(`${API_BASE}/convert`, {
            file_id: file_id,
            target_format: selectedFormat,
            original_name: file.name
          });

          const { converted_file_id, converted_filename } = convertResponse.data;

          // Update status to completed
          setConversions(prev => 
            prev.map(conv => 
              conv.id === file.id 
                ? { 
                    ...conv, 
                    status: 'completed' as const,
                    downloadUrl: `${API_BASE}/download/${converted_file_id}_${converted_filename}`
                  }
                : conv
            )
          );

          toast.success(`${file.name} converted successfully`);
        } catch (error: any) {
          setConversions(prev => 
            prev.map(conv => 
              conv.id === file.id 
                ? { 
                    ...conv, 
                    status: 'error' as const,
                    error: error.response?.data?.detail || 'Conversion failed'
                  }
                : conv
            )
          );
          
          const errorMessage = error.response?.data?.detail || `Failed to convert ${file.name}`;
          toast.error(errorMessage);
        }
      }
    } finally {
      setIsConverting(false);
    }
  };
  const downloadFile = async (downloadUrl: string, fileName: string, format: string) => {
    try {
      const response = await axios.get(downloadUrl, {
        responseType: 'blob',
        // Add timeout and validate status
        timeout: 30000,
        validateStatus: (status) => status === 200,
      });

      // Validate that we received a blob
      if (!(response.data instanceof Blob)) {
        throw new Error('Invalid response format');
      }

      // Create blob URL
      const blob = new Blob([response.data], { type: response.headers['content-type'] });
      const url = window.URL.createObjectURL(blob);

      // Create and configure download link
      const link = document.createElement('a');
      link.href = url;
      
      // Generate safe filename
      const nameWithoutExt = fileName.split('.').slice(0, -1).join('.');
      const safeFileName = `${nameWithoutExt}_converted.${format}`.replace(/[^a-zA-Z0-9-_. ]/g, '_');
      link.setAttribute('download', safeFileName);
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      toast.success(`${safeFileName} downloaded successfully`);
    } catch (error: any) {
      console.error('Download error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Download failed';
      toast.error(errorMessage);
    }
  };

  const clearAll = () => {
    setFiles([]);
    setConversions([]);
    setSelectedFormat('');
  };

  const getStatusIcon = (status: ConversionTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'converting':
        return <Transform color="primary" />;
      default:
        return <Transform color="disabled" />;
    }
  };

  const getStatusColor = (status: ConversionTask['status']) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'error':
        return 'error';
      case 'converting':
        return 'primary';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', padding: 3 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          File Converter
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Convert your files to different formats easily
        </Typography>      </Box>      <Grid container spacing={3}>
        {/* Upload Section */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Upload Files
              </Typography>
              
              <Box
                {...getRootProps()}
                className={`dropzone ${isDragActive ? 'active' : ''}`}
                sx={{
                  border: '2px dashed',
                  borderColor: isDragActive ? 'primary.main' : 'grey.300',
                  borderRadius: 2,
                  p: 3,
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: isDragActive ? 'action.hover' : 'transparent',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                <input {...getInputProps()} />
                <CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  {isDragActive
                    ? 'Drop the files here...'
                    : 'Drag & drop files here, or click to select'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Supports: DOCX, TXT, PDF, XLSX, CSV, JPG, PNG, BMP
                </Typography>
              </Box>

              {files.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Selected Files ({files.length})
                  </Typography>
                  <List>
                    {files.map((file) => (
                      <ListItem key={file.id} divider>
                        <ListItemText
                          primary={file.name}
                          secondary={`${(file.size / 1024 / 1024).toFixed(2)} MB`}
                        />
                        <ListItemSecondaryAction>
                          <Chip 
                            label={getFileExtension(file.name).toUpperCase()} 
                            size="small" 
                            sx={{ mr: 1 }}
                          />
                          <IconButton onClick={() => removeFile(file.id)}>
                            <Delete />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </CardContent>
          </Card>        </Grid>        {/* Conversion Section */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Convert Settings
              </Typography>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Target Format</InputLabel>
                <Select
                  value={selectedFormat}
                  label="Target Format"
                  onChange={(e) => setSelectedFormat(e.target.value)}
                >
                  {Object.entries(SUPPORTED_FORMATS).map(([category, formats]) => [
                    <Typography key={category} variant="subtitle2" sx={{ p: 1, fontWeight: 'bold' }}>
                      {category}
                    </Typography>,
                    ...formats.map((format) => (
                      <MenuItem key={format} value={format}>
                        {format.toUpperCase()}
                      </MenuItem>
                    ))
                  ])}
                </Select>
              </FormControl>

              <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <Button
                  variant="contained"
                  onClick={convertFiles}
                  disabled={files.length === 0 || !selectedFormat || isConverting}
                  startIcon={<Transform />}
                  fullWidth
                >
                  {isConverting ? 'Converting...' : 'Convert Files'}
                </Button>
                
                <Button
                  variant="outlined"
                  onClick={clearAll}
                  startIcon={<Delete />}
                >
                  Clear All
                </Button>
              </Box>

              {isConverting && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    Converting files...
                  </Typography>
                  <LinearProgress />
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Conversion Results */}        {conversions.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  Conversion Results
                </Typography>
                
                <List>
                  {conversions.map((conversion) => (
                    <ListItem key={conversion.id} divider>
                      <Box sx={{ mr: 2 }}>
                        {getStatusIcon(conversion.status)}
                      </Box>
                      
                      <ListItemText
                        primary={conversion.fileName}
                        secondary={
                          <Box>
                            <Typography variant="body2">
                              {conversion.fromFormat.toUpperCase()} → {conversion.toFormat.toUpperCase()}
                            </Typography>                            {conversion.error && (
                              <Alert severity="error" sx={{ mt: 1 }}>
                                {typeof conversion.error === 'string' 
                                  ? conversion.error 
                                  : conversion.error?.detail || 'Conversion failed'}
                              </Alert>
                            )}
                          </Box>
                        }
                      />
                      
                      <ListItemSecondaryAction sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip 
                          label={conversion.status} 
                          color={getStatusColor(conversion.status)}
                          size="small"
                        />
                        
                        {conversion.status === 'completed' && conversion.downloadUrl && (
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<Download />}
                            onClick={() => downloadFile(
                              conversion.downloadUrl!,
                              conversion.fileName,
                              conversion.toFormat
                            )}
                          >
                            Download
                          </Button>
                        )}
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default FileConverter;
