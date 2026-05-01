
// components/DatePicker.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { SelectSingleEventHandler } from "react-day-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface DatePickerProps {
  date: Date | undefined;
  onSelect: (date: Date | undefined) => void;
}

export function DatePicker({ date, onSelect }: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const isMobile = useIsMobile();

    const handleDateSelect: SelectSingleEventHandler = (selectedDate) => {
        onSelect(selectedDate);
        setOpen(false);
    };
    
    if (isMobile) {
        return (
            <Drawer open={open} onOpenChange={setOpen}>
                <DrawerTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="datepicker-trigger" data-state="ready">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? date.toLocaleDateString() : <span>Pick a date</span>}
                    </Button>
                </DrawerTrigger>
                <DrawerContent data-testid="datepicker-drawer-content">
                    <DrawerHeader className="text-center sm:text-left">
                        <DrawerTitle>Select a date</DrawerTitle>
                        <DrawerDescription>Choose a date for your trip.</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 pt-8" data-state="ready" data-testid="datepicker-calendar">
                      <Calendar
                          mode="single"
                          selected={date}
                          onSelect={handleDateSelect}
                          initialFocus
                      />
                    </div>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal" data-testid="datepicker-trigger" data-state="ready">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? date.toLocaleDateString() : <span>Pick a date</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" data-state="ready" data-testid="datepicker-calendar">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleDateSelect}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
}
