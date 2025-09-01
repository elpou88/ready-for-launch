import { AlertCircle, Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MaintenanceBannerProps {
  isVisible: boolean;
  message?: string;
}

export function MaintenanceBanner({ isVisible, message }: MaintenanceBannerProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 animate-in slide-in-from-top">
      <Alert className="bg-yellow-900/90 border-yellow-500/50 text-yellow-200 backdrop-blur-sm">
        <Clock className="h-4 w-4" />
        <AlertDescription className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span className="font-semibold">Maintenance Mode:</span>
          {message || 'Backend deployment in progress. Please wait...'}
        </AlertDescription>
      </Alert>
    </div>
  );
}