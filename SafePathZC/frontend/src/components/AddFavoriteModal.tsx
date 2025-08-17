
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface AddFavoriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFavorite: (favorite: any) => void;
}

export const AddFavoriteModal = ({ isOpen, onClose, onAddFavorite }: AddFavoriteModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    from: '',
    to: '',
    frequency: 'Daily',
    riskLevel: 'low'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.from || !formData.to) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newFavorite = {
      id: Date.now(),
      name: formData.name,
      from: formData.from,
      to: formData.to,
      frequency: formData.frequency,
      avgDuration: 'N/A',
      lastUsed: 'Never',
      riskLevel: formData.riskLevel
    };

    onAddFavorite(newFavorite);
    toast.success('Favorite route added successfully!');

    // Reset form
    setFormData({
      name: '',
      from: '',
      to: '',
      frequency: 'Daily',
      riskLevel: 'low'
    });

    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Favorite Route</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Route Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Home to Work"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="from">From *</Label>
            <Input
              id="from"
              placeholder="Starting location"
              value={formData.from}
              onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="to">To *</Label>
            <Input
              id="to"
              placeholder="Destination"
              value={formData.to}
              onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="frequency">Frequency</Label>
            <Select value={formData.frequency} onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Daily">Daily</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Occasionally">Occasionally</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="riskLevel">Risk Level</Label>
            <Select value={formData.riskLevel} onValueChange={(value) => setFormData(prev => ({ ...prev, riskLevel: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Add Favorite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};