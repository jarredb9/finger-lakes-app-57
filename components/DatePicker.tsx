
// components/DatePicker.tsx
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { SelectSingleEventHandler } from "react-day-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerClose,
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
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    const handleDateSelect: SelectSingleEventHandler = (selectedDate) => {
        onSelect(selectedDate);
        if (isMobile) {
            closeButtonRef.current?.click();
        } else {
            setOpen(false);
        }
    };
    
    if (isMobile) {
        return (
            <Drawer>
                <DrawerTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? date.toLocaleDateString() : <span>Pick a date</span>}
                    </Button>
                </DrawerTrigger>
                <DrawerContent>
                    <DrawerHeader className="text-left">
                        <DrawerTitle>Select a date</DrawerTitle>
                        <DrawerDescription>Choose a date for your trip.</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4">
                      <Calendar
                          mode="single"
                          selected={date}
                          onSelect={handleDateSelect}
                          initialFocus
                      />
                    </div>
                    <DrawerClose ref={closeButtonRef} className="sr-only">Close</DrawerClose>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? date.toLocaleDateString() : <span>Pick a date</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
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
